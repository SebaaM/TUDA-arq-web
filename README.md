# Ejemplo 01: de Django clásico a una API

Base de trabajo para retomar una aplicación Django renderizada en el servidor y, durante la clase, hacerla evolucionar hacia una API consumida desde React.

El repositorio comienza con dos aplicaciones independientes:

- `backend/`: Django, el modelo `Activity`, PostgreSQL y una vista HTML clásica.
- `frontend/`: Vite + React + TypeScript para la implementación cliente del laboratorio.

## Opción 1: arranque automático con scripts

### Windows

Con Docker Desktop instalado, ejecutar desde PowerShell:

```powershell
.\iniciar.ps1
```

El script está comentado por pasos y usa el modo objetivo por defecto: Nginx, React compilado,
Gunicorn y PostgreSQL. Crea `.env` si falta, intenta iniciar Docker Desktop si el motor no responde,
construye las imágenes y espera a que los servicios estén listos. Las dependencias de Python y pnpm
se instalan dentro de las imágenes; el entrypoint de Django aplica las migraciones automáticamente.
Después comprueba Django, carga datos de ejemplo **solo si las tablas de actividades, participantes
e inscripciones están vacías** y verifica las respuestas HTTP del frontend y la API.

Abrir <http://localhost/>. Para desarrollar con Vite y recarga automática:

```powershell
.\iniciar.ps1 -Modo desarrollo
```

Abrir <http://localhost:5173/>. Las opciones se pueden combinar:

```powershell
# Reutilizar imágenes ya construidas para un arranque más rápido.
.\iniciar.ps1 -SinBuild

# Levantar sin cargar datos de ejemplo, incluso si la base está vacía.
.\iniciar.ps1 -SinDatos
```

Si PowerShell bloquea el script por su política de ejecución, se puede habilitar únicamente
para ese proceso, sin cambiar la configuración permanente:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\iniciar.ps1
```

Al cambiar entre objetivo y desarrollo, Compose recrea los servicios compartidos y retira
los contenedores del modo anterior, conservando los volúmenes. Cada modo tiene su propia base.
Si ya hay cualquier dato de dominio, el script omite **todas** las semillas: las actuales restauran
la muestra y podrían eliminar datos propios. Si falla, informa el paso y muestra el estado y los
últimos logs; no elimina volúmenes. El primer build requiere conexión a Internet.

### macOS y Linux

Requiere Bash 3.2 o posterior, `curl` y Docker con el plugin Compose. En macOS se puede
usar Docker Desktop; en Linux, Docker Engine o Docker Desktop con acceso para el usuario actual.
Desde la raíz del proyecto:

```bash
bash iniciar.sh
```

Tiene el mismo flujo de preparación, migraciones, carga segura de datos y comprobaciones HTTP
que `iniciar.ps1`. Usa el modo objetivo por defecto, disponible en <http://localhost/>.
Las opciones se pueden combinar:

```bash
# Desarrollo con Vite y recarga, en http://localhost:5173/.
bash iniciar.sh --modo desarrollo

# Arranque rápido con las imágenes existentes.
bash iniciar.sh --sin-build

# Omitir la carga de datos de ejemplo.
bash iniciar.sh --sin-datos

# Mostrar todos los parámetros.
bash iniciar.sh --help
```

En Mac intenta abrir Docker Desktop si el motor está apagado. En Linux intenta iniciar
Docker rootless o Docker Desktop como servicio del usuario. Para Docker Engine con systemd,
si hace falta arrancar el servicio del sistema, ejecutar primero `sudo systemctl start docker`.
El script no pide `sudo` ni cambia permisos del socket; `docker info` debe funcionar con el usuario
que lo ejecuta. Python y pnpm se instalan dentro de las imágenes.

No es necesario dar permiso de ejecución al invocarlo con `bash`. Si se prefiere `./iniciar.sh`:

```bash
chmod +x iniciar.sh
./iniciar.sh
```

## Opción 2: arranque manual con Docker Compose

Esta opción ejecuta los pasos desde la terminal, sin usar `iniciar.ps1` ni `iniciar.sh`.
Los comandos siguientes parten de la raíz del repositorio. Requiere Docker con Compose;
Python, Django, pnpm y PostgreSQL se ejecutan dentro de los contenedores.

### 1. Iniciar Docker y preparar el entorno

Abrir Docker Desktop en Windows/macOS, o iniciar Docker Engine en Linux. Para una instalación
de Docker Engine con systemd se puede usar `sudo systemctl start docker`.
Comprobar que el usuario actual tenga acceso al motor:

```bash
docker info
docker compose version
```

Crear `.env` únicamente si no existe. En macOS/Linux:

```bash
if [ ! -f .env ]; then cp .env.example .env; fi
```

En PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Revisar las variables `POSTGRES_*`, `DJANGO_*` y `VITE_PROXY_TARGET` antes del primer arranque.
Dentro de Compose, Django encuentra PostgreSQL mediante `POSTGRES_HOST=db` y Vite alcanza
la API mediante `VITE_PROXY_TARGET=http://api:8000`.

### 2. Construir y levantar la ejecución objetivo

```bash
# Validar el archivo Compose y las variables, sin imprimir credenciales.
docker compose config --quiet

# Construir las imágenes y esperar a que los servicios estén listos.
docker compose up --build -d --wait --wait-timeout 180 --remove-orphans
```

Este modo levanta PostgreSQL, Django/Gunicorn y Nginx con React compilado. Solo Nginx publica
el puerto 80. `--remove-orphans` retira contenedores del modo anterior al cambiar de configuración,
sin eliminar sus volúmenes.

### 3. Comprobar Django y las migraciones

El entrypoint aplica las migraciones automáticamente antes de iniciar Django. Para comprobarlo
o volver a aplicarlas explícitamente, sin duplicarlas:

```bash
docker compose exec api python manage.py migrate --noinput
docker compose exec api python manage.py check
```

### 4. Cargar datos de ejemplo en una base nueva

Primero consultar si ya hay actividades, participantes o inscripciones:

```bash
docker compose exec api python manage.py shell --command "from activities.models import Activity, Participant, Enrollment; print({'activities': Activity.objects.count(), 'participants': Participant.objects.count(), 'enrollments': Enrollment.objects.count()})"
```

**Ejecutar las semillas siguientes solo si los tres valores son cero.** A diferencia de los
scripts automáticos, estos comandos manuales no comprueban si hay datos: restauran la muestra
y pueden eliminar actividades, participantes e inscripciones existentes.

```bash
docker compose exec api python manage.py seed_activities
docker compose exec api python manage.py seed_participants_and_enrollments
```

En arranques posteriores, omitir este paso para conservar las modificaciones propias.

### 5. Abrir y verificar el proyecto

- Aplicación: <http://localhost/>.
- API v1: <http://localhost/api/v1/activities/>.
- API v2: <http://localhost/api/v2/activities/>.
- Swagger: <http://localhost/api/docs>.

```bash
docker compose ps
curl -i http://localhost/
curl -i http://localhost/api/v2/activities/
docker compose logs --tail 50 api nginx
```

En PowerShell usar `curl.exe` en lugar de `curl`. Las consultas deben responder HTTP 200.
Si un servicio falla, revisar `docker compose logs --tail 50 db api nginx`.

### 6. Usar el modo desarrollo manualmente

Para trabajar con Vite y `runserver`, usar `compose.dev.yaml` en todos los comandos:

```bash
docker compose -f compose.dev.yaml config --quiet
docker compose -f compose.dev.yaml up --build -d --wait --wait-timeout 180 --remove-orphans
docker compose -f compose.dev.yaml exec api python manage.py migrate --noinput
docker compose -f compose.dev.yaml exec api python manage.py check
```

Abrir <http://localhost:5173/> para React y <http://localhost:8000/api/docs> para la API directa.
Este modo tiene una base distinta de la ejecución objetivo. Si necesita datos iniciales,
repetir la comprobación y las semillas del paso 4 agregando `-f compose.dev.yaml` después de
`docker compose` en cada comando. También usar esa opción para `ps`, `logs` y `exec`.

### 7. Detener y volver a iniciar

```bash
# Detener el objetivo conservando sus datos.
docker compose down

# Volver a iniciar con las imágenes existentes y esperar los servicios.
docker compose up -d --wait --wait-timeout 180 --remove-orphans

# Detener el desarrollo conservando sus datos.
docker compose -f compose.dev.yaml down
```

No agregar `-v` al detener si se quieren conservar los datos: `docker compose down -v`
elimina también el volumen de PostgreSQL de la ejecución objetivo.

## Puesta en marcha local avanzada sin contenedores de aplicación

Esta variante requiere Python, pnpm y una instancia de PostgreSQL accesible desde la computadora.
Para el backend local ajustar `POSTGRES_HOST=127.0.0.1` (o el host real) en `.env`, en lugar de
`db`, que solo resuelve dentro de Compose. Vite usa por defecto `http://127.0.0.1:8000` como proxy;
si se define `VITE_PROXY_TARGET` para el proceso local, usar esa dirección en vez de `api:8000`.

### 1. Backend

Requiere una instancia de PostgreSQL accesible según las variables de `.env`.
Desde la raíz del repositorio, crear el archivo de entorno:

```bash
cp .env.example .env
```

En PowerShell:

```powershell
Copy-Item .env.example .env
```

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_activities
python manage.py seed_participants_and_enrollments
python manage.py runserver
```

Abrir <http://127.0.0.1:8000/>.

### 2. Frontend

En otra terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

Abrir <http://127.0.0.1:5173/>.

## Dockerfiles y responsabilidades

- `backend/Dockerfile`: construye la imagen de Django, instala `requirements.txt`, copia el backend y ejecuta Gunicorn.
- `backend/docker-entrypoint.sh`: aplica migraciones antes de iniciar el proceso principal. No ejecuta semillas automáticamente.
- `frontend/dockerfile`: Dockerfile multi-stage con targets `development`, `build` y `production`.
  - `development` ejecuta Vite con recarga.
  - `build` genera `dist/` mediante `pnpm build`.
  - `production` usa Nginx para servir el build.
- `frontend/nginx.conf`: sirve React, resuelve rutas SPA y reenvía `/api/*` al servicio Django.

El nombre `frontend/dockerfile` está escrito en minúsculas y debe conservarse así en sistemas Linux.

## Topología

### Desarrollo: `compose.dev.yaml`

```text
Navegador
   ├── localhost:5173 → app/Vite
   └── localhost:8000 → api/Django runserver
                              │
                              ▼
                         db/PostgreSQL
```

### Objetivo: `compose.yaml`

```text
Navegador
   │
   ▼
localhost:80 → nginx
                 ├── React compilado
                 └── /api/* → api/Gunicorn
                                  │
                                  ▼
                             db/PostgreSQL
```

## Checkpoint intermedio: API con Gunicorn

`compose.gunicorn.yaml` permite probar el servidor de aplicación sin Vite ni Nginx:

```bash
docker compose -f compose.gunicorn.yaml up --build -d
```

La API queda publicada en <http://localhost:8000/>. Para cargar datos en una base nueva,
seguir las precauciones de la opción manual usando `-f compose.gunicorn.yaml`.
Detenerlo con `docker compose -f compose.gunicorn.yaml down` antes de cambiar de modo.
La ejecución objetivo completa se inicia con `compose.yaml`, como indica la opción 2.

## Verificación rápida

```bash
cd backend
python manage.py test

cd ../frontend
pnpm format
pnpm lint
pnpm build
```

Para validar la configuración Compose sin iniciar contenedores:

```bash
docker compose config
docker compose -f compose.dev.yaml config
```

## API versionada (v1/v2)

El backend expone dos versiones del contrato HTTP que conviven bajo el mismo
proyecto. La rama `versionado` introdujo la v2 sin tocar la v1.

Reglas del versionado:

- `v1` queda **exactamente** como estaba: `capacity` y `available_slots` viajan
  en el nivel raíz de `Activity`.
- `v2` agrega `category` y agrupa el cupo en `availability`:
  `{ "id": "...", "title": "...", "category": "General", "starts_at": "...", "availability": { "capacity": 20, "available_slots": 3 } }`.
- `Enrollment`, los errores (`code` + `message`) y la idempotencia son
  idénticos entre versiones.
- La lógica de dominio y la persistencia son compartidas: las v2 extienden las
  vistas v1 (`ActivityListViewV2(ActivityListView)`, ...) y solo cambian el
  serializador público (`serializer_class`) y los metadatos de OpenAPI.

Endpoints disponibles:

| Método   | Endpoint                            | Versión |
| -------- | ----------------------------------- | ------- |
| `GET`    | `/api/v1/activities/`               | v1      |
| `GET`    | `/api/v1/activities/{activity_id}/` | v1      |
| `GET`    | `/api/v1/me/enrollments/`           | v1      |
| `PUT`    | `/api/v1/me/enrollments/{id}/`      | v1      |
| `DELETE` | `/api/v1/me/enrollments/{id}/`      | v1      |
| `GET`    | `/api/v2/activities/`               | v2      |
| `POST`   | `/api/v2/activities/`               | v2      |
| `GET`    | `/api/v2/activities/{activity_id}/` | v2      |
| `GET`    | `/api/v2/me/enrollments/`           | v2      |
| `PUT`    | `/api/v2/me/enrollments/{id}/`      | v2      |
| `DELETE` | `/api/v2/me/enrollments/{id}/`      | v2      |

La documentación OpenAPI también se genera por versión:

- `http://127.0.0.1:8000/api/v1/openapi.json` — solo el contrato v1.
- `http://127.0.0.1:8000/api/v2/openapi.json` — solo el contrato v2.
- `http://127.0.0.1:8000/api/openapi.json` — esquema combinado (v1 + v2).
- `http://127.0.0.1:8000/api/docs` — Swagger UI del esquema combinado.

La suite de tests cubre la regresión de v1, la coexistencia de ambas versiones
(idempotencia del `PUT`/`DELETE`, errores consistentes) y la diferencia
estructural de `Activity` en cada OpenAPI:

```bash
cd backend
python manage.py test
```

## Punto de partida didáctico

El proyecto conserva la vista HTML clásica y las implementaciones cliente como
etapas comparables. El backend Django expone la API JSON documentada en
`API.md`; `frontend/` permite trabajar con Vite + React. Para observar la
arquitectura híbrida del backend clásico, desactivar JavaScript deja visible
el contenido HTML producido por Django.

## Instrucciones para agentes

`AGENTS.md` contiene las decisiones persistentes del repositorio: stack, pnpm, estructura, aliases, Definition of Done y el uso obligatorio de shadcn/ui. La skill `.agents/skills/ui-design/SKILL.md` encapsula el procedimiento especializado para tareas visuales: comprobar la instalación, reutilizar primitives, incorporar solo los necesarios y validar accesibilidad y responsive.

Esta separación mantiene las reglas generales visibles para cualquier tarea y carga el conocimiento de diseño solo cuando la tarea involucra interfaz.

## Trazabilidad de interacciones

La rama `api-correlacion` agrega correlación transversal a la API sin crear
v3 ni modificar los contratos v1/v2:

- `X-Correlation-ID` es opcional en request y obligatorio en response. Si el
  cliente envía un valor, la API lo conserva exactamente; si no, genera un UUID.
- Los logs usan un schema estructurado por eventos (`request_received`,
  `participant_auth_checked`, `activity_lookup`, `enrollment_created`,
  `enrollment_reused`, `enrollment_rejected`, `enrollment_cancelled`,
  `request_completed`) con campos estables y el mismo `correlation_id`.
- El mismo identificador permite reconstruir entrada, decisión y salida de una
  interacción (por ejemplo `demo-42` en `request_received`, `enrollment_created`
  y `request_completed=201`).
- No se registran secretos ni payloads; el detalle del contrato está en
  `backend/README.md`.
