# Ejemplo 01: de Django clásico a una API

Base de trabajo para retomar una aplicación Django renderizada en el servidor y, durante la clase, hacerla evolucionar hacia una API consumida desde React.

El repositorio comienza con dos aplicaciones independientes:

- `backend/`: Django, el modelo `Activity`, PostgreSQL y una vista HTML clásica.
- `frontend/`: Vite + React + TypeScript para la implementación cliente del laboratorio.

## Arranque automático en Windows

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

## Puesta en marcha local

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

## Puesta en marcha con Docker Compose

El modo de desarrollo usa PostgreSQL, Django con `runserver` y Vite dentro de Compose.
Copiá el archivo de variables antes del primer arranque:

```bash
cp .env.example .env
docker compose -f compose.dev.yaml up --build -d
docker compose -f compose.dev.yaml exec api python manage.py seed_activities
docker compose -f compose.dev.yaml exec api python manage.py seed_participants_and_enrollments
```

En PowerShell, el primer comando equivalente es:

```powershell
Copy-Item .env.example .env
```

Las migraciones se aplican automáticamente al iniciar el backend. El backend queda disponible en <http://127.0.0.1:8000/> y el frontend en <http://127.0.0.1:5173/>.
Las semillas se ejecutan una sola vez sobre una base nueva porque restauran datos de demostración.

Para detener ambos servicios:

```bash
docker compose -f compose.dev.yaml down
```

Para probar el servidor de aplicación sin Vite:

```bash
docker compose -f compose.gunicorn.yaml up --build -d
docker compose -f compose.gunicorn.yaml exec api python manage.py seed_activities
docker compose -f compose.gunicorn.yaml exec api python manage.py seed_participants_and_enrollments
```

En este modo Django se ejecuta con Gunicorn y la API queda temporalmente publicada en <http://127.0.0.1:8000/>. Es un checkpoint intermedio; la ejecución final usa Nginx como única frontera pública.

Este Compose es un checkpoint de la etapa de servidor de aplicación. La ejecución final se realiza con `compose.yaml`.

La ejecución objetivo completa usa el build de React, Gunicorn, PostgreSQL y Nginx:

```bash
docker compose up --build -d
docker compose exec api python manage.py seed_activities
docker compose exec api python manage.py seed_participants_and_enrollments
```

El navegador debe utilizar solamente <http://localhost/>. En este modo solo Nginx publica un puerto; Django y PostgreSQL permanecen en la red interna.

Para observar la topología:

```bash
docker compose ps
docker compose logs -f nginx
docker compose logs -f api
```

Para detener la ejecución objetivo conservando PostgreSQL:

```bash
docker compose down
```

Para eliminar también los datos persistidos y comenzar desde cero:

```bash
docker compose down -v
```

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
