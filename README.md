# TUDA — Actividades e inscripciones

Aplicación React + TypeScript con API Django REST Framework y PostgreSQL. El Hito 2 incorpora JWT y conserva las representaciones e idempotencia del Hito 1.

## Iniciar desde una copia limpia

Requisitos: Git y Docker Desktop con motor Linux y Docker Compose. Los comandos siguientes se ejecutan desde la raíz del repositorio. No se necesita instalar Python, Node ni PostgreSQL en el host para usar Compose.

```powershell
# Solo si todavía no existe .env
Copy-Item .env.example .env
docker compose up --build -d --wait
docker compose exec api python manage.py seed_evaluation
```

Abrir [http://localhost/](http://localhost/). Swagger está en [http://localhost/api/docs](http://localhost/api/docs).

Las migraciones se aplican al iniciar el backend. Las semillas son explícitas: no se ejecutan en cada arranque. No sobrescribir un `.env` configurado.

| Usuario de evaluación | Contraseña local | Permiso |
| --- | --- | --- |
| juan | Evaluacion2026! | Consultar e inscribirse |
| maria | Evaluacion2026! | Consultar e inscribirse |
| docente | Evaluacion2026! | Staff: también crear actividades |

Estas credenciales se crean exclusivamente para la evaluación local. `seed_evaluation` restablece sus contraseñas y vincula participantes por UUID; conserva actividades e inscripciones existentes. Los antiguos comandos `seed_activities` y `seed_participants_and_enrollments` restauran datos de forma destructiva: no son parte del arranque del Hito 2.

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
docker compose -f compose.dev.yaml up --build -d --wait
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
