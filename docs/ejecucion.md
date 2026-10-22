# Ejecución y diagnóstico

Esta guía amplía el [inicio rápido](../README.md#inicio-rápido). Todos los comandos Compose se ejecutan desde la raíz del repositorio. Los modos objetivo, desarrollo y Gunicorn son alternativas: no levantarlos juntos con la configuración actual.

## Índice

- [Arranque con scripts](#arranque-con-scripts)
- [Arranque manual con Docker Compose](#arranque-manual-con-docker-compose)
- [Datos y cuentas de evaluación](#datos-y-cuentas-de-evaluación)
- [Desarrollo con recarga](#desarrollo-con-recarga)
- [Ejecución local sin contenedores de aplicación](#puesta-en-marcha-local-avanzada-sin-contenedores-de-aplicación)
- [Checkpoint Gunicorn](#checkpoint-intermedio-api-con-gunicorn)
- [Persistencia y diagnóstico](#persistencia-y-diagnóstico)
- [Contexto didáctico](#punto-de-partida-didáctico)

## Arranque con scripts

### Windows

Con **Docker Desktop** instalado, ejecutar desde PowerShell en la raíz:

```powershell
.\iniciar.ps1
```

El script está comentado por pasos y usa el modo objetivo por defecto: Nginx, React compilado, Gunicorn y PostgreSQL. Crea `.env` solo si falta, intenta iniciar Docker Desktop si el motor no responde, valida Compose sin imprimir secretos, construye las imágenes y espera los healthchecks. Las dependencias de Python y pnpm se instalan dentro de las imágenes; el entrypoint de Django aplica las migraciones automáticamente.

Después comprueba Django, carga la muestra histórica **solo si actividades, participantes e inscripciones están todas vacías**, prepara las cuentas locales mediante `seed_evaluation` y verifica HTTP 200 en el frontend y la API. Si ya hay datos de dominio, omite la muestra histórica y conserva las inscripciones; aun así crea o vincula las cuentas de evaluación por UUID. Este último paso restablece sus contraseñas locales cada vez que se ejecuta el script sin `-SinDatos`.

Abrir [http://localhost/](http://localhost/). Para desarrollar con Vite y recarga:

```powershell
.\iniciar.ps1 -Modo desarrollo
```

En desarrollo, antes de levantar los servicios, el script construye las imágenes (salvo con `-SinBuild`), detiene solo `app` y sincroniza su volumen `node_modules` mediante `pnpm install --frozen-lockfile` con `CI=true`. Así puede actualizar dependencias de otra versión de pnpm o de un lockfile anterior sin pedir confirmación en un contenedor sin terminal. No elimina volúmenes de PostgreSQL. `-SinDatos` no omite esta preparación de dependencias.

Abrir [http://localhost:5173/](http://localhost:5173/). Las opciones se pueden combinar:

```powershell
# Reutilizar imágenes ya construidas.
.\iniciar.ps1 -SinBuild

# No cargar la muestra ni crear/restablecer las cuentas de evaluación.
.\iniciar.ps1 -SinDatos

# Combinación para desarrollo sin modificar datos ni contraseñas.
.\iniciar.ps1 -Modo desarrollo -SinBuild -SinDatos
```

Si PowerShell bloquea el script por la política de ejecución, se puede habilitar solo para ese proceso, sin cambiar la configuración permanente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar.ps1
```

Al cambiar entre objetivo y desarrollo, el script recrea los servicios compartidos y retira los contenedores del modo anterior, conservando los volúmenes. Cada modo tiene su propia base. Ante un fallo muestra el estado y los últimos logs; no elimina volúmenes. El primer build requiere conexión a Internet.

### macOS y Linux

Requiere Bash 3.2 o posterior, `curl` y Docker con el plugin Compose. En macOS se puede usar Docker Desktop; en Linux, Docker Engine o Docker Desktop con acceso para el usuario actual. Desde la raíz:

```bash
bash iniciar.sh
```

Tiene el mismo flujo de preparación, migraciones, muestra histórica condicionada a una base vacía, cuentas de evaluación y comprobaciones HTTP que `iniciar.ps1`. Usa el modo objetivo, disponible en [http://localhost/](http://localhost/).

Con `--modo desarrollo` también sincroniza las dependencias del volumen antes de iniciar Vite, con `CI=true` y lockfile congelado. `--sin-build` evita reconstruir las imágenes, pero no omite la sincronización; `--sin-datos` solo afecta a las semillas y cuentas.

```bash
# Desarrollo con Vite y recarga, en http://localhost:5173/.
bash iniciar.sh --modo desarrollo

# Reutilizar imágenes existentes.
bash iniciar.sh --sin-build

# Omitir tanto la muestra como la creación/restablecimiento de cuentas.
bash iniciar.sh --sin-datos

# Mostrar los parámetros.
bash iniciar.sh --help
```

En Mac intenta abrir Docker Desktop si el motor está apagado. En Linux intenta iniciar Docker rootless o Docker Desktop como servicio del usuario. Para Docker Engine con systemd, si hace falta iniciar el servicio del sistema, ejecutar primero `sudo systemctl start docker`. El script no pide `sudo` ni cambia permisos del socket: `docker info` debe funcionar con el usuario que lo ejecuta.

Python y pnpm se instalan dentro de las imágenes. No es necesario dar permiso de ejecución al invocarlo con `bash`. Si se prefiere `./iniciar.sh`:

```bash
chmod +x iniciar.sh
./iniciar.sh
```

## Arranque manual con Docker Compose

Requisitos: Git y Docker Desktop con motor Linux y Docker Compose. Los comandos siguientes se ejecutan desde la raíz del repositorio. No se necesita instalar Python, Node ni PostgreSQL en el host para usar Compose.

En Linux también se puede usar Docker Engine con el plugin Compose. Esta opción permite ejecutar cada paso sin los scripts de arranque.

### 1. Iniciar Docker y preparar el entorno

Abrir Docker Desktop o iniciar Docker Engine. Comprobar el acceso del usuario al motor:

```bash
docker info
docker compose version
```

Crear `.env` únicamente si no existe. En PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

En macOS/Linux:

```bash
if [ ! -f .env ]; then cp .env.example .env; fi
```

Revisar las variables `POSTGRES_*`, `DJANGO_*`, `JWT_*`, `AUTH_COOKIE_SECURE` y `VITE_PROXY_TARGET` antes del primer arranque. Dentro de Compose, Django encuentra PostgreSQL mediante `POSTGRES_HOST=db` y Vite alcanza la API mediante `VITE_PROXY_TARGET=http://api:8000`.

### 2. Construir y levantar la ejecución objetivo

```bash
# Validar sin imprimir credenciales.
docker compose config --quiet
docker compose up --build -d --wait --wait-timeout 180 --remove-orphans
```

Solo Nginx publica el puerto 80. `--remove-orphans` retira contenedores ajenos a la configuración elegida dentro del mismo proyecto Compose, pero no sus volúmenes. Para cambiar de modo manualmente, detener primero el anterior como se explica en desarrollo.

### 3. Comprobar Django y las migraciones

El entrypoint aplica las migraciones al iniciar, incluidas las de usuarios, el vínculo de participantes y la blacklist de refresh tokens. Se pueden comprobar o aplicar de nuevo sin duplicarlas:

```bash
docker compose exec api python manage.py migrate --noinput
docker compose exec api python manage.py check
```

### 4. Preparar las cuentas y los datos de evaluación

```bash
docker compose exec api python manage.py seed_evaluation
```

Abrir [http://localhost/](http://localhost/). Swagger está en [http://localhost/api/docs](http://localhost/api/docs).

Las semillas son explícitas: el entrypoint no las ejecuta en cada arranque del contenedor. Los scripts del [arranque automático](#arranque-con-scripts) sí las solicitan, salvo con `SinDatos`. No sobrescribir un `.env` configurado.

Los antiguos comandos `seed_activities` y `seed_participants_and_enrollments` restauran datos de forma destructiva. Los scripts solo los usan si las tres tablas de dominio están vacías; no ejecutarlos manualmente sobre una base que se quiera conservar. Para diagnosticar el contenido sin modificarlo:

```bash
docker compose exec api python manage.py shell --command "from activities.models import Activity, Participant, Enrollment; print({'activities': Activity.objects.count(), 'participants': Participant.objects.count(), 'enrollments': Enrollment.objects.count()})"
```

En arranques posteriores no hace falta repetir `seed_evaluation`, salvo que se quiera crear o restablecer esas cuentas locales.

### 5. Abrir y verificar el proyecto

Las direcciones están reunidas en [README principal](../README.md#uso-y-cuentas-de-evaluación). Después de abrir la aplicación, comprobar los servicios:

```bash
docker compose ps
curl -i http://localhost/
curl -i http://localhost/api/v2/activities/
docker compose logs --tail 50 api nginx
```

En PowerShell usar `curl.exe` en lugar de `curl`. Las consultas públicas deben responder HTTP 200. Si un servicio falla, revisar `docker compose logs --tail 50 db api nginx`.

## Datos y cuentas de evaluación

Los scripts las preparan automáticamente salvo que se indique `-SinDatos` o `--sin-datos`. En el arranque manual se preparan con `seed_evaluation`, como se indica en el [paso 4 del arranque manual](#4-preparar-las-cuentas-y-los-datos-de-evaluación).

| Usuario de evaluación | Contraseña local | Permiso                          |
| --------------------- | ---------------- | -------------------------------- |
| juan                  | Evaluacion2026!  | Consultar e inscribirse          |
| maria                 | Evaluacion2026!  | Consultar e inscribirse          |
| docente               | Evaluacion2026!  | Staff: también crear actividades |

Estas credenciales se crean exclusivamente para la evaluación local. `seed_evaluation` restablece sus contraseñas y vincula participantes por UUID; conserva actividades e inscripciones existentes y no crea inscripciones de muestra. Si el participante ya existe, conserva también su nombre: por eso la cuenta `docente` puede aparecer vinculada a Carlos Martínez en una base con la muestra histórica.

## Desarrollo con recarga

Detener el modo objetivo antes de cambiar: los Compose actuales comparten nombre de proyecto y servicios.

```powershell
docker compose down
docker compose -f compose.dev.yaml config --quiet
docker compose -f compose.dev.yaml up --build -d --wait --wait-timeout 180 --remove-orphans
docker compose -f compose.dev.yaml exec api python manage.py migrate --noinput
docker compose -f compose.dev.yaml exec api python manage.py check
docker compose -f compose.dev.yaml exec api python manage.py seed_evaluation
```

- React/Vite: [http://localhost:5173/](http://localhost:5173/).
- Django/API: [http://localhost:8000/api/docs](http://localhost:8000/api/docs).
- PostgreSQL: puerto local 5432 para herramientas de desarrollo.
- Vite reenvía `/api` a `http://api:8000`; React sigue usando URLs relativas.
- Código montado para recarga; dependencias Linux del frontend en volumen `frontend_node_modules`.

### Topología de desarrollo

```text
Navegador → localhost:5173 → app / Vite
                               └── /api/* → api:8000 / Django runserver
                                                        └── db:5432 / PostgreSQL
Navegador → localhost:8000 ────────────────────┘
Herramientas locales → localhost:5432 ────────────────────────┘
```

### Dependencias del frontend en desarrollo

Los scripts de arranque ya sincronizan el volumen automáticamente en desarrollo. Si se usa Compose manualmente, o aparece `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`, detener solo el frontend y sincronizar el volumen existente sin confirmaciones interactivas:

```powershell
docker compose -f compose.dev.yaml stop app
docker compose -f compose.dev.yaml run --rm --no-deps -T -e CI=true app pnpm install --frozen-lockfile
docker compose -f compose.dev.yaml up --build -d --wait
```

Reconstruir una imagen no reemplaza el contenido de un volumen `node_modules` ya existente. Este paso modifica únicamente dependencias generadas; no requiere `down -v` ni eliminar datos de la base. La primera sincronización o un cambio de dependencias puede necesitar conexión a Internet.

El servicio `app` fija `pnpm_config_store_dir=/root/.local/share/pnpm/store`, la misma ruta usada durante el build, tanto para instalar como para iniciar Vite. pnpm 11 requiere el prefijo `pnpm_config_` para esta configuración. Así el montaje de Windows no hace que pnpm cambie de store ni cree una caché de paquetes dentro del código fuente; tampoco es necesario pasar rutas Linux como argumentos desde Git Bash.

### Volver al modo objetivo

Para volver al objetivo:

```powershell
docker compose -f compose.dev.yaml down
docker compose up --build -d --wait
```

Usar `-f compose.dev.yaml` también en `ps`, `logs`, `exec` y `down` mientras se trabaja en desarrollo. Este modo tiene una base distinta: las cuentas creadas en el objetivo no aparecen automáticamente aquí.

## Puesta en marcha local avanzada sin contenedores de aplicación

Esta variante requiere Python 3.12 o posterior, Node compatible con el frontend, pnpm y una instancia de PostgreSQL accesible desde la computadora. Crear `.env` solo si falta, siguiendo el paso 1 de la opción manual.

Para el backend local ajustar `POSTGRES_HOST=127.0.0.1` (o el host real) en `.env`, en lugar de `db`, que solo resuelve dentro de Compose. No cambiar esa configuración si luego se pretende usar el mismo archivo dentro de Docker sin volver a ajustarla.

Vite usa por defecto `http://127.0.0.1:8000` como proxy. Si se define `VITE_PROXY_TARGET` para el proceso local, usar esa dirección, no `api:8000`. El `.env` de la raíz es leído por Django y Compose; Vite carga los archivos de entorno de `frontend/` y las variables del proceso que lo inicia.

### 1. Backend

Desde la raíz, en macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_evaluation
python manage.py runserver
```

En Windows/PowerShell, usar `python -m venv .venv` y `.\.venv\Scripts\Activate.ps1` para crear y activar el entorno; los comandos posteriores son los mismos.

Abrir [http://127.0.0.1:8000/](http://127.0.0.1:8000/) para la vista HTML clásica y [Swagger](http://127.0.0.1:8000/api/docs) para la API.

### 2. Frontend

En otra terminal, desde la raíz:

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

Abrir [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Usar el mismo host durante el flujo de autenticación y comprobar que el origen esté admitido por `DJANGO_CSRF_TRUSTED_ORIGINS`.

## Checkpoint intermedio: API con Gunicorn

`compose.gunicorn.yaml` permite probar el servidor de aplicación sin Vite ni Nginx. Detener antes el modo que esté activo:

```bash
docker compose -f compose.gunicorn.yaml config --quiet
docker compose -f compose.gunicorn.yaml up --build -d --wait
docker compose -f compose.gunicorn.yaml exec api python manage.py seed_evaluation
```

La API queda publicada en [http://localhost:8000/](http://localhost:8000/), con PostgreSQL local en 5432. Usa su propio volumen. Detenerlo con `docker compose -f compose.gunicorn.yaml down` antes de cambiar de modo. La ejecución objetivo completa usa `compose.yaml`.

## Persistencia y diagnóstico

```powershell
docker compose ps
docker compose logs -f api
docker compose down
docker compose up -d --wait
```

`down` conserva los volúmenes. El objetivo usa `untdf-pgdata-target`, desarrollo usa `untdf-pgdata` y el checkpoint usa `untdf-pgdata-gunicorn`; los nombres efectivos llevan el prefijo del proyecto. No comparten datos entre modos.

`docker compose down -v` elimina el volumen del modo objetivo y sus datos. Solo usarlo para un reinicio deliberado, nunca como requisito de actualización. La eliminación de volúmenes no invalida criptográficamente access tokens que ya se hayan emitido.

No se necesita habilitar CORS para el flujo normal: la UI utiliza /api en el mismo origen mediante Nginx o el proxy Vite. Los logs de negocio usan un identificador de correlación y no registran contraseñas, tokens ni cookies.

Para seguir una petición por su `X-Correlation-ID`, ver [trazabilidad del backend](../backend/README.md#trazabilidad-x-correlation-id). Para comprobar migraciones, OpenAPI, CSRF y concurrencia, ver [la guía de evaluación](hito-2-evaluacion.md#automatización).

## Punto de partida didáctico

El proyecto conserva la vista HTML clásica y la implementación cliente como etapas comparables. Django produce HTML en su ruta `/`, accesible directamente en desarrollo o en el checkpoint Gunicorn; esa página sigue visible si se desactiva JavaScript.

En cambio, `/` en la topología objetivo lo sirve Nginx con React compilado: no es la vista clásica ni renderizado del lado del servidor. El backend expone la API JSON documentada en [API.md](../API.md), consumida por `frontend/`.
