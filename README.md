# Ejemplo 01: de Django clásico a una API

Aplicación React + TypeScript con API Django REST Framework y PostgreSQL. El Hito 2 incorpora JWT y conserva las representaciones e idempotencia del Hito 1.

Base de trabajo para retomar una aplicación Django renderizada en el servidor y hacerla evolucionar hacia una API consumida desde React durante la clase. El repositorio conserva dos aplicaciones comparables:

- `backend/`: Django, los modelos de actividades e inscripciones, PostgreSQL y una vista HTML clásica.
- `frontend/`: Vite + React + TypeScript para la implementación cliente del laboratorio.

## Opción 1: arranque automático con scripts

### Windows

Con Docker Desktop instalado, ejecutar desde PowerShell en la raíz:

```powershell
.\iniciar.ps1
```

El script está comentado por pasos y usa el modo objetivo por defecto: Nginx, React compilado, Gunicorn y PostgreSQL. Crea `.env` solo si falta, intenta iniciar Docker Desktop si el motor no responde, valida Compose sin imprimir secretos, construye las imágenes y espera los healthchecks. Las dependencias de Python y pnpm se instalan dentro de las imágenes; el entrypoint de Django aplica las migraciones automáticamente.

Después comprueba Django, carga la muestra histórica **solo si actividades, participantes e inscripciones están todas vacías**, prepara las cuentas locales mediante `seed_evaluation` y verifica HTTP 200 en el frontend y la API. Si ya hay datos de dominio, omite la muestra histórica y conserva las inscripciones; aun así crea o vincula las cuentas de evaluación por UUID. Este último paso restablece sus contraseñas locales cada vez que se ejecuta el script sin `-SinDatos`.

Abrir [http://localhost/](http://localhost/). Para desarrollar con Vite y recarga:

```powershell
.\iniciar.ps1 -Modo desarrollo
```

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

## Opción 2: arranque manual con Docker Compose

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

Las semillas son explícitas: el entrypoint no las ejecuta en cada arranque del contenedor. Los scripts de la opción 1 sí las solicitan, salvo con `SinDatos`. No sobrescribir un `.env` configurado.

| Usuario de evaluación | Contraseña local | Permiso |
| --- | --- | --- |
| juan | Evaluacion2026! | Consultar e inscribirse |
| maria | Evaluacion2026! | Consultar e inscribirse |
| docente | Evaluacion2026! | Staff: también crear actividades |

Estas credenciales se crean exclusivamente para la evaluación local. `seed_evaluation` restablece sus contraseñas y vincula participantes por UUID; conserva actividades e inscripciones existentes y no crea inscripciones de muestra. Si el participante ya existe, conserva también su nombre: por eso la cuenta `docente` puede aparecer vinculada a Carlos Martínez en una base con la muestra histórica.

Los antiguos comandos `seed_activities` y `seed_participants_and_enrollments` restauran datos de forma destructiva. Los scripts solo los usan si las tres tablas de dominio están vacías; no ejecutarlos manualmente sobre una base que se quiera conservar. Para diagnosticar el contenido sin modificarlo:

```bash
docker compose exec api python manage.py shell --command "from activities.models import Activity, Participant, Enrollment; print({'activities': Activity.objects.count(), 'participants': Participant.objects.count(), 'enrollments': Enrollment.objects.count()})"
```

En arranques posteriores no hace falta repetir `seed_evaluation`, salvo que se quiera crear o restablecer esas cuentas locales.

### 5. Abrir y verificar el proyecto

- Aplicación: [http://localhost/](http://localhost/).
- API v1: [http://localhost/api/v1/activities/](http://localhost/api/v1/activities/).
- API v2: [http://localhost/api/v2/activities/](http://localhost/api/v2/activities/).
- Swagger: [http://localhost/api/docs](http://localhost/api/docs).

```bash
docker compose ps
curl -i http://localhost/
curl -i http://localhost/api/v2/activities/
docker compose logs --tail 50 api nginx
```

En PowerShell usar `curl.exe` en lugar de `curl`. Las consultas públicas deben responder HTTP 200. Si un servicio falla, revisar `docker compose logs --tail 50 db api nginx`.

## Topología objetivo

```text
Navegador → localhost:80 → Nginx
                            ├── / → React compilado (dist/)
                            └── /api/* → api:8000 → Gunicorn / Django
                                                      ├── valida JWT y permisos
                                                      └── db:5432 → PostgreSQL → volumen
```

Solo Nginx publica un puerto. Django y PostgreSQL son accesibles por la red Compose. Nginx conserva el prefijo `/api` y reenvía Authorization, cookies y respuestas Set-Cookie.

PostgreSQL almacena cuentas, participantes, actividades, inscripciones y refresh tokens invalidados. El access se conserva en memoria en React; el refresh está en una cookie HttpOnly del navegador. Django es quien valida la identidad y aplica permisos.

## Archivos de ejecución

| Archivo | Responsabilidad |
| --- | --- |
| `backend/Dockerfile` | Python y dependencias, código Django y proceso Gunicorn con dos workers. |
| `backend/docker-entrypoint.sh` | Aplica migraciones y ejecuta el proceso recibido con `exec`. El build normaliza LF. |
| `frontend/dockerfile` | Multi-stage: dependencies instala con pnpm; development ejecuta Vite; build genera dist; production usa Nginx. El nombre está en minúsculas. |
| `frontend/nginx.conf` | Archivos React, fallback SPA y proxy /api hacia Django. |
| `compose.yaml` | Ejecución objetivo: db, api y nginx. |
| `compose.dev.yaml` | Desarrollo con recarga: db, api y app. |
| `compose.gunicorn.yaml` | Checkpoint histórico de Gunicorn sin frontend; API directa en 8000. |

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

Al cambiar dependencias frontend de un entorno ya creado, sincronizar el volumen existente:

```powershell
docker compose -f compose.dev.yaml run --rm --no-deps app pnpm install --frozen-lockfile
docker compose -f compose.dev.yaml up --build -d --wait
```

Para volver al objetivo:

```powershell
docker compose -f compose.dev.yaml down
docker compose up --build -d --wait
```

Usar `-f compose.dev.yaml` también en `ps`, `logs`, `exec` y `down` mientras se trabaja en desarrollo. Este modo tiene una base distinta: las cuentas creadas en el objetivo no aparecen automáticamente aquí.

### Topología de desarrollo

```text
Navegador → localhost:5173 → app / Vite
                               └── /api/* → api:8000 / Django runserver
                                                        └── db:5432 / PostgreSQL
Navegador → localhost:8000 ────────────────────┘
Herramientas locales → localhost:5432 ────────────────────────┘
```

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

## Configuración

`.env.example` es la plantilla versionada; `.env` contiene la configuración local y no se versiona. Compose la usa para interpolar valores y el backend recibe sus variables mediante `env_file`. Fuera de Docker, Django puede leer el `.env` de la raíz.

| Variable | Uso |
| --- | --- |
| POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD | Nombre y credenciales de PostgreSQL. |
| POSTGRES_HOST / POSTGRES_PORT | Destino desde Django: db / 5432 dentro de Compose. Fuera de Docker usar un host accesible, como 127.0.0.1. |
| DJANGO_SECRET_KEY | Secreto Django. La plantilla solo incluye un valor de laboratorio. |
| DJANGO_DEBUG | Desarrollo; el Compose objetivo lo fuerza a false. |
| DJANGO_ALLOWED_HOSTS | Hosts HTTP aceptados; el objetivo usa localhost,127.0.0.1,api. |
| JWT_SIGNING_KEY | Clave para firmar JWT; si falta se usa el secreto Django. Usar un secreto propio fuera de evaluación. |
| JWT_ACCESS_MINUTES / JWT_REFRESH_HOURS | Duraciones, por defecto 5 minutos y 24 horas. |
| AUTH_COOKIE_SECURE | false para HTTP local; true al desplegar con HTTPS. |
| DJANGO_CSRF_TRUSTED_ORIGINS | Orígenes explícitos de Vite local para las operaciones con cookie. |
| VITE_PROXY_TARGET | Destino del proxy de desarrollo; no es una URL que deba conocer el navegador. |

## Autenticación y autorización

El login recibe usuario/contraseña. Devuelve access y datos de la cuenta; el refresh se entrega exclusivamente por cookie HttpOnly. React restaura la sesión al recargar mediante refresh y envía access en `Authorization: Bearer ...`.

El access no se guarda en localStorage, sessionStorage ni IndexedDB. Los endpoints login, refresh y logout exigen cookie CSRF y `X-CSRFToken`. HttpOnly evita leer el refresh desde JavaScript; no sustituye la protección CSRF.

- GET de actividades: público.
- Crear actividad: solo staff autenticado.
- Mis inscripciones, inscripción y cancelación: usuario autenticado con participante asociado.
- `X-Participant-ID` ya no autentica ni selecciona a quién inscribir.
- PUT repetido: 201 y luego 200 con la misma inscripción; DELETE repetido: 204 sin body.
- La reserva/cancelación bloquea la actividad en una transacción PostgreSQL para preservar el cupo con varios workers.
- Los errores conservan `{code, message}` y las respuestas incluyen `X-Correlation-ID`.

Al cerrar sesión se elimina el estado de React, se invalida el refresh en PostgreSQL y se expira la cookie. Un access ya emitido sigue válido hasta vencer (hasta cinco minutos). Logout afecta a esa sesión, no a todos los dispositivos. No hay rotación del refresh: conserva su expiración original, sin extender las 24 horas al renovar. No hay registro público ni recuperación de contraseña.

Si falla la conexión durante logout, React limpia la sesión local e informa que no pudo confirmar la invalidación remota, con opción de reintentar.

## Verificación

```powershell
docker compose exec api python manage.py test
docker compose exec api python manage.py check --deploy
docker compose exec api python manage.py makemigrations --check --dry-run
docker compose exec api python manage.py spectacular --validate --fail-on-warn
docker compose ps
docker compose logs api
docker compose logs nginx
```

`check --deploy` puede advertir sobre HTTPS, cookies seguras y secretos de evaluación: la topología es local HTTP, no un despliegue público endurecido.

Con Node compatible y pnpm instalados, desde frontend:

```powershell
pnpm install --frozen-lockfile
pnpm format
pnpm lint
pnpm test
pnpm build
```

También se pueden ejecutar los controles frontend dentro del servicio app de desarrollo.

Consultar [API.md](API.md) para rutas y ejemplos, [la guía de evaluación](docs/hito-2-evaluacion.md), [los resultados comprobados](docs/hito-2-validacion.md) y [la línea base](docs/contracts/README.md) para comparar el contrato anterior.

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

## API versionada (v1/v2)

El backend expone dos versiones del contrato HTTP que conviven bajo el mismo proyecto. La v2 se incorporó sin sustituir la representación pública de la v1; Hito 2 cambia la autenticación de las operaciones privadas en ambas.

- v1 mantiene `capacity` y `available_slots` en el nivel raíz de `Activity`.
- v2 agrega `category` y agrupa el cupo en `availability`:
  `{ "id": "...", "title": "...", "category": "General", "starts_at": "...", "availability": { "capacity": 20, "available_slots": 3 } }`.
- `Enrollment` conserva `activity_id` y `enrolled_at`; los errores usan `code` y `message`, y la idempotencia es idéntica entre versiones.
- La lógica de dominio y la persistencia son compartidas. Las vistas v2 extienden las v1 y cambian el serializador público y los metadatos de OpenAPI.

| Método | Endpoint | Permiso |
| --- | --- | --- |
| GET | `/api/v1/activities/` | Público |
| GET | `/api/v1/activities/{activity_id}/` | Público |
| GET | `/api/v1/participants/` | Público, consulta histórica |
| GET | `/api/v1/participants/{participant_id}/` | Público, consulta histórica |
| GET | `/api/v1/me/enrollments/` | JWT y participante asociado |
| PUT / DELETE | `/api/v1/me/enrollments/{activity_id}/` | JWT y participante asociado |
| GET | `/api/v2/activities/` | Público |
| POST | `/api/v2/activities/` | JWT y staff |
| GET | `/api/v2/activities/{activity_id}/` | Público |
| GET | `/api/v2/me/enrollments/` | JWT y participante asociado |
| PUT / DELETE | `/api/v2/me/enrollments/{activity_id}/` | JWT y participante asociado |

La documentación OpenAPI también se genera por versión:

- [OpenAPI v1](http://localhost/api/v1/openapi.json): contrato v1.
- [OpenAPI v2](http://localhost/api/v2/openapi.json): contrato v2.
- [Esquema combinado](http://localhost/api/openapi.json): v1, v2 y autenticación.
- [Swagger UI](http://localhost/api/docs): exploración del esquema combinado.

En desarrollo se accede a las mismas rutas desde `http://localhost:8000` o mediante el proxy de `http://localhost:5173`. La suite comprueba regresión de v1, coexistencia entre versiones, estructuras OpenAPI e idempotencia cruzada de PUT/DELETE. Ver [API.md](API.md) para ejemplos completos y errores.

## Punto de partida didáctico

El proyecto conserva la vista HTML clásica y la implementación cliente como etapas comparables. Django produce HTML en su ruta `/`, accesible directamente en desarrollo o en el checkpoint Gunicorn; esa página sigue visible si se desactiva JavaScript.

En cambio, `/` en la topología objetivo lo sirve Nginx con React compilado: no es la vista clásica ni renderizado del lado del servidor. El backend expone la API JSON documentada en [API.md](API.md), consumida por `frontend/`.

## Instrucciones para agentes

[AGENTS.md](AGENTS.md) contiene las decisiones persistentes del repositorio: stack, pnpm, estructura, aliases, Definition of Done y uso obligatorio de shadcn/ui. La skill [.agents/skills/ui-design/SKILL.md](.agents/skills/ui-design/SKILL.md) encapsula el procedimiento para tareas visuales: comprobar la instalación, reutilizar primitives, agregar solo las necesarias y validar accesibilidad y responsive.

Esta separación mantiene las reglas generales visibles para cualquier tarea y carga el conocimiento de diseño cuando el trabajo involucra interfaz.

## Trazabilidad de interacciones

La correlación transversal de la API no crea una v3 ni cambia los cuerpos de v1/v2:

- `X-Correlation-ID` es opcional en request y está presente en las respuestas de Django. Si el cliente envía un valor no vacío, la API lo conserva; si falta o está vacío, genera un UUID.
- Los logs tienen eventos estructurados: `request_received`, `participant_auth_checked`, `activity_lookup`, `enrollment_created`, `enrollment_reused`, `enrollment_rejected`, `enrollment_cancelled` y `request_completed`, con campos estables y el mismo `correlation_id`.
- El identificador permite reconstruir entrada, decisión y salida de una interacción: por ejemplo, `demo-42` en `request_received`, `enrollment_created` y `request_completed=201`.
- No se registran secretos ni payloads. El [README del backend](backend/README.md) detalla campos, rotación del archivo, eventos y búsqueda de una interacción.
