#Requires -Version 5.1
<#
.SYNOPSIS
Prepara y levanta el proyecto desde PowerShell.
.EXAMPLE
.\iniciar.ps1
.EXAMPLE
.\iniciar.ps1 -Modo desarrollo
.EXAMPLE
.\iniciar.ps1 -SinBuild -SinDatos
#>

[CmdletBinding()]
param(
    # Objetivo usa Nginx/Gunicorn; desarrollo usa Vite/runserver con recarga.
    [ValidateSet('objetivo', 'desarrollo')]
    [string]$Modo = 'objetivo',

    # Reutiliza las imagenes existentes en lugar de reconstruirlas.
    [switch]$SinBuild,

    # Omite tanto la muestra historica como las cuentas locales de evaluacion.
    [switch]$SinDatos
)

# Detiene el script ante errores de PowerShell y evita variables mal escritas.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Cada comando Docker debe terminar correctamente antes de continuar al siguiente paso.
function Invoke-Docker {
    param([string[]]$DockerArguments)
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker fallo (codigo $LASTEXITCODE): docker $($DockerArguments -join ' ')"
    }
}

# Comprueba el motor sin imprimir configuraciones, credenciales ni errores de cada intento.
function Test-DockerEngine {
    try {
        & docker info --format '{{.ServerVersion}}' *> $null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

# Espera una respuesta HTTP 200 para comprobar el acceso desde el navegador.
function Wait-Http {
    param([string]$Url)
    $deadline = (Get-Date).AddSeconds(60)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) {
                Write-Host "HTTP 200: $Url"
                return
            }
        } catch {
            # Un servicio puede tardar unos segundos en aceptar conexiones.
        }
        Start-Sleep -Seconds 2
    } while ((Get-Date) -lt $deadline)
    throw "El servicio no respondio correctamente: $Url"
}

# Usa la carpeta del script aunque se ejecute desde otra ubicacion.
Push-Location -LiteralPath $PSScriptRoot
$composeArguments = @()
try {
    # Se necesita Docker Desktop con contenedores Linux; Python y pnpm corren en Docker.
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'No se encontro Docker. Instala Docker Desktop y volve a ejecutar este script.'
    }
    Invoke-Docker -DockerArguments @('compose', 'version')

    # Crea .env solo en el primer arranque; nunca pisa una configuracion existente.
    if (-not (Test-Path -LiteralPath '.env')) {
        Copy-Item -LiteralPath '.env.example' -Destination '.env'
        Write-Host 'Se creo .env a partir de .env.example.'
    }

    # Selecciona el archivo Compose y las direcciones del modo solicitado.
    $composeFile = if ($Modo -eq 'desarrollo') { 'compose.dev.yaml' } else { 'compose.yaml' }
    $composeArguments = @('compose', '-f', $composeFile)
    $webUrl = if ($Modo -eq 'desarrollo') { 'http://localhost:5173/' } else { 'http://localhost/' }

    # Valida las variables y el YAML sin mostrar secretos en la terminal.
    Invoke-Docker -DockerArguments ($composeArguments + @('config', '--quiet'))

    # Si el motor esta apagado, intenta iniciar Docker Desktop desde su instalacion habitual.
    if (-not (Test-DockerEngine)) {
        $desktopPath = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
        if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
            if (-not (Test-Path -LiteralPath $desktopPath)) {
                throw 'Inicia Docker Desktop manualmente; no se encontro en la ruta habitual.'
            }
            Write-Host 'Iniciando Docker Desktop...'
            Start-Process -FilePath $desktopPath -WindowStyle Hidden
        }
        Write-Host 'Esperando al motor Docker (hasta 120 segundos)...'
        $engineDeadline = (Get-Date).AddSeconds(120)
        while (-not (Test-DockerEngine)) {
            if ((Get-Date) -ge $engineDeadline) {
                throw 'Docker no responde. Revisa Docker Desktop y los permisos de acceso al motor.'
            }
            Start-Sleep -Seconds 3
        }
    }

    # Construye imagenes y espera los healthchecks. Al cambiar de modo retira contenedores
    # del modo anterior, pero conserva todos los volumenes de PostgreSQL.
    Write-Host "Iniciando el modo $Modo..."
    if ($Modo -eq 'desarrollo') {
        # El volumen node_modules puede pertenecer a otra version de pnpm o lockfile.
        # Prepararlo ANTES de up evita que app falle al pedir confirmacion sin TTY.
        if (-not $SinBuild) {
            Invoke-Docker -DockerArguments ($composeArguments + @('build'))
        }
        Invoke-Docker -DockerArguments ($composeArguments + @('stop', 'app'))
        Write-Host 'Sincronizando dependencias del frontend sin confirmaciones interactivas...'
        Invoke-Docker -DockerArguments ($composeArguments + @('run', '--rm', '--no-deps', '-T', '-e', 'CI=true', 'app', 'pnpm', 'install', '--frozen-lockfile'))
    }
    $upArguments = @('up', '--detach', '--wait', '--wait-timeout', '180', '--remove-orphans')
    if (-not $SinBuild -and $Modo -ne 'desarrollo') { $upArguments += '--build' }
    Invoke-Docker -DockerArguments ($composeArguments + $upArguments)

    # El entrypoint de la imagen ya ejecuta migrate --noinput antes de iniciar Django.
    # Este chequeo confirma que el contenedor cargo una configuracion Django valida.
    Invoke-Docker -DockerArguments ($composeArguments + @('exec', '-T', 'api', 'python', 'manage.py', 'check'))

    if (-not $SinDatos) {
        # Las semillas existentes borran datos al restaurar la muestra. Por eso solo
        # se invocan si las TRES tablas de dominio estan vacias, dentro de una transaccion.
        # El bloqueo evita que otro arranque o una inscripcion se intercalen con la carga.
        $seedCode = @'
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
'@
        # Envia el codigo por stdin para conservar comillas y saltos de linea en Windows.
        $seedCode | & docker @composeArguments exec -T api python manage.py shell
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la inicializacion de los datos de demostracion.' }

        # Crea o vincula las cuentas JWT por UUID sin borrar datos existentes.
        # Es una inicializacion local explicita: restablece las contrasenas de evaluacion.
        Invoke-Docker -DockerArguments ($composeArguments + @('exec', '-T', 'api', 'python', 'manage.py', 'seed_evaluation'))
        Write-Host 'Cuentas locales de evaluacion preparadas: juan, maria y docente. Ver credenciales en README.md.'
    }

    # Comprueba tanto React como la API a traves de la entrada publica del modo elegido.
    Wait-Http -Url $webUrl
    Wait-Http -Url "${webUrl}api/v2/activities/"
    Invoke-Docker -DockerArguments ($composeArguments + @('ps'))

    # Muestra las URLs y comandos necesarios para el uso cotidiano.
    Write-Host "`nProyecto disponible: $webUrl"
    Write-Host "Swagger: ${webUrl}api/docs"
    Write-Host "Logs: docker compose -f $composeFile logs -f"
    Write-Host "Detener conservando los datos: docker compose -f $composeFile down"
} catch {
    # Deja un diagnostico si el build, las migraciones o el arranque fallaron.
    Write-Warning $_.Exception.Message
    if ($composeArguments.Count -gt 0 -and (Test-DockerEngine)) {
        & docker @composeArguments ps -a
        & docker @composeArguments logs --tail 30
    }
    exit 1
} finally {
    # Restaura la carpeta desde la cual el usuario ejecuto el script.
    Pop-Location
}
