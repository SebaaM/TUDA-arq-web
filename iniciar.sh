#!/usr/bin/env bash
# Arranca el proyecto en macOS y Linux. Compatible con Bash 3.2 o posterior.
# Uso: bash iniciar.sh [--modo objetivo|desarrollo] [--sin-build] [--sin-datos]

# Detiene la ejecucion ante errores, variables inexistentes o fallos en tuberias.
set -Eeuo pipefail

# Los valores iniciales equivalen a ejecutar iniciar.ps1 sin parametros.
modo=objetivo
sin_build=0
sin_datos=0
compose_ready=0

# Explica las opciones sin requerir que Docker este instalado o iniciado.
usage() {
    printf '%s\n' \
        'Uso: bash iniciar.sh [opciones]' \
        '  --modo objetivo|desarrollo  Objetivo usa Nginx; desarrollo usa Vite.' \
        '  --sin-build                 Reutiliza las imagenes existentes.' \
        '  --sin-datos                 Omite la muestra y las cuentas de evaluacion.' \
        '  -h, --help                  Muestra esta ayuda.'
}

# Si algo falla, muestra los ultimos logs y conserva los contenedores y volumenes.
on_error() {
    local code="$1" line="$2"
    trap - ERR
    set +e
    printf '\nError en la linea %s (codigo %s).\n' "$line" "$code" >&2
    if [[ "$compose_ready" -eq 1 ]] && docker info >/dev/null 2>&1; then
        "${compose[@]}" ps -a
        "${compose[@]}" logs --tail 30
    fi
    exit "$code"
}
trap 'on_error "$?" "$LINENO"' ERR

# Lee las opciones; una opcion desconocida termina sin modificar el proyecto.
while [[ $# -gt 0 ]]; do
    case "$1" in
        --modo)
            if [[ $# -lt 2 ]] || [[ "$2" != objetivo && "$2" != desarrollo ]]; then
                printf 'Usa --modo objetivo o --modo desarrollo.\n' >&2
                exit 2
            fi
            modo="$2"
            shift 2
            ;;
        --sin-build) sin_build=1; shift ;;
        --sin-datos) sin_datos=1; shift ;;
        -h|--help) usage; exit 0 ;;
        *) printf 'Opcion desconocida: %s\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
done

# Resuelve la raiz desde el script, aunque la terminal este en otra carpeta.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd -- "$script_dir"

# Docker/Compose y curl son los unicos requisitos locales; Python y pnpm corren en Docker.
for tool in docker curl; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        printf 'Falta el comando %s. Instalalo y vuelve a ejecutar el script.\n' "$tool" >&2
        exit 1
    fi
done
docker compose version

# Genera .env solo en el primer arranque, sin sobrescribir la configuracion del usuario.
if [[ ! -e .env ]]; then
    cp .env.example .env
    printf 'Se creo .env a partir de .env.example.\n'
fi

# El modo define los servicios y la URL de entrada; las rutas con espacios se conservan.
compose_file=compose.yaml
web_url=http://localhost/
if [[ "$modo" == desarrollo ]]; then
    compose_file=compose.dev.yaml
    web_url=http://localhost:5173/
fi
compose=(docker compose -f "$compose_file")
compose_ready=1

# Valida Compose y las variables sin mostrar credenciales en la terminal.
"${compose[@]}" config --quiet

# Si el motor no responde, intenta arrancarlo segun el sistema operativo.
if ! docker info >/dev/null 2>&1; then
    case "$(uname -s)" in
        Darwin)
            printf 'Iniciando Docker Desktop...\n'
            open -g -a Docker
            ;;
        Linux)
            # Estos servicios de usuario cubren Docker rootless y Docker Desktop en Linux.
            if command -v systemctl >/dev/null 2>&1 && systemctl --user cat docker.service >/dev/null 2>&1; then
                systemctl --user start docker.service
            elif command -v systemctl >/dev/null 2>&1 && systemctl --user cat docker-desktop.service >/dev/null 2>&1; then
                systemctl --user start docker-desktop.service
            elif [[ "$(id -u)" -eq 0 ]] && command -v systemctl >/dev/null 2>&1; then
                systemctl start docker.service
            else
                printf '%s\n' \
                    'Docker no responde o tu usuario no tiene acceso al motor.' \
                    'Si usas Docker Engine con systemd: sudo systemctl start docker' \
                    'Si usas Docker Desktop: abre la aplicacion y reintenta.' \
                    'Comprueba que docker info funcione con tu usuario.' >&2
                exit 1
            fi
            ;;
        *) printf 'El motor Docker no esta disponible en este sistema.\n' >&2; exit 1 ;;
    esac

    # Espera hasta dos minutos a que el motor termine de inicializarse.
    printf 'Esperando al motor Docker (hasta 120 segundos)...\n'
    engine_deadline=$((SECONDS + 120))
    until docker info >/dev/null 2>&1; do
        if [[ "$SECONDS" -ge "$engine_deadline" ]]; then
            printf 'Docker no responde. Revisa la aplicacion, el servicio y sus permisos.\n' >&2
            exit 1
        fi
        sleep 3
    done
fi

# Construye las imagenes y espera los healthchecks. Al cambiar de modo retira
# contenedores del modo anterior, pero mantiene los volumenes y sus datos.
printf 'Iniciando el modo %s...\n' "$modo"
if [[ "$modo" == desarrollo ]]; then
    # El volumen puede conservar dependencias de otro pnpm o lockfile. Sincronizarlo
    # antes de up evita confirmaciones de reinstalacion sin terminal interactiva.
    if [[ "$sin_build" -eq 0 ]]; then "${compose[@]}" build; fi
    "${compose[@]}" stop app
    printf 'Sincronizando dependencias del frontend sin confirmaciones interactivas...\n'
    "${compose[@]}" run --rm --no-deps -T -e CI=true app pnpm install --frozen-lockfile
fi
up_args=(up --detach --wait --wait-timeout 180 --remove-orphans)
if [[ "$sin_build" -eq 0 && "$modo" != desarrollo ]]; then up_args+=(--build); fi
"${compose[@]}" "${up_args[@]}"

# El entrypoint ejecuta migrate --noinput antes de iniciar Django; ahora se verifica su configuracion.
"${compose[@]}" exec -T api python manage.py check

if [[ "$sin_datos" -eq 0 ]]; then
    # Las semillas borran registros al restaurar la muestra. Se ejecutan solo si
    # las tres tablas estan vacias. La transaccion y el bloqueo evitan una carga parcial
    # o interferencias con otra ejecucion del script y con inscripciones simultaneas.
    "${compose[@]}" exec -T api python manage.py shell <<'PY'
from django.core.management import call_command
from django.db import connection, transaction
from activities.models import Activity, Participant, Enrollment

with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute('LOCK TABLE activities_activity, activities_participant, activities_enrollment IN EXCLUSIVE MODE')
    if Activity.objects.exists() or Participant.objects.exists() or Enrollment.objects.exists():
        print('Datos existentes: se omiten las semillas para conservarlos.')
    else:
        call_command('seed_activities')
        call_command('seed_participants_and_enrollments')
        print('Base nueva: actividades, participantes e inscripciones cargados.')
PY

    # Crea o vincula las cuentas JWT por UUID sin borrar inscripciones existentes.
    # Este paso explicito restablece las contrasenas locales documentadas en README.md.
    "${compose[@]}" exec -T api python manage.py seed_evaluation
    printf 'Cuentas locales de evaluacion preparadas: juan, maria y docente. Ver credenciales en README.md.\n'
fi

# Espera HTTP 200 en cada URL; curl limita el tiempo de cada peticion a cinco segundos.
wait_http() {
    local url="$1" deadline=$((SECONDS + 60)) status
    while [[ "$SECONDS" -lt "$deadline" ]]; do
        status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$url" 2>/dev/null) || status=000
        if [[ "$status" == 200 ]]; then
            printf 'HTTP 200: %s\n' "$url"
            return 0
        fi
        sleep 2
    done
    printf 'El servicio no respondio correctamente: %s\n' "$url" >&2
    return 1
}

# Comprueba React y la API por la misma entrada que usa el navegador.
wait_http "$web_url"
wait_http "${web_url}api/v2/activities/"
"${compose[@]}" ps

# Deja las direcciones y comandos de uso cotidiano visibles al terminar.
printf '\nProyecto disponible: %s\n' "$web_url"
printf 'Swagger: %sapi/docs\n' "$web_url"
printf 'Logs: docker compose -f %s logs -f\n' "$compose_file"
printf 'Detener conservando los datos: docker compose -f %s down\n' "$compose_file"
