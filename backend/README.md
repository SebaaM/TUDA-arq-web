# Backend Django y API OpenAPI

API Django REST Framework sobre PostgreSQL. Gunicorn ejecuta config.wsgi:application con dos workers en el modo objetivo; runserver se mantiene en desarrollo.

La ruta `/` del backend conserva la vista HTML clásica. `/api/v1` mantiene la representación original y `/api/v2` expone la utilizada por React. Hito 2 incorpora autenticación JWT sin cambiar los cuerpos de actividades e inscripciones ni las reglas de idempotencia.

La documentación canónica de rutas y cuerpos está en [API.md](../API.md). Ver el [README raíz](../README.md) para el inicio rápido, [Ejecución y diagnóstico](../docs/ejecucion.md) para los modos de arranque y [Configuración del entorno](../docs/configuracion.md) para las variables.

## Ejecución con Docker

Desde la raíz:

```powershell
docker compose up --build -d --wait
docker compose exec api python manage.py seed_evaluation
docker compose exec api python manage.py test
```

El entrypoint aplica migraciones antes del comando recibido. Incluye tablas de usuarios, vínculo opcional participante–usuario y blacklist. No carga semillas al iniciar.

Los scripts `iniciar.ps1` e `iniciar.sh`, desde la raíz, sí solicitan la carga inicial y `seed_evaluation`, excepto con `-SinDatos` / `--sin-datos`. El comando crea o vincula `juan`, `maria` y `docente` y restablece sus contraseñas locales; no elimina inscripciones. Ver las credenciales y las precauciones en el [README raíz](../README.md).

## Requisitos e inicio local sin contenedores de aplicación

Requiere Python 3.12 o posterior y PostgreSQL accesible. Django lee el `.env` de la raíz: crearlo desde `.env.example` solo si no existe y ajustar `POSTGRES_HOST=127.0.0.1` cuando PostgreSQL no se resuelva como `db`. Las variables del proceso tienen prioridad sobre ese archivo.

Desde `backend/`, en macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py seed_evaluation
python manage.py runserver
```

En Windows/PowerShell usar `python -m venv .venv` y `.\.venv\Scripts\Activate.ps1`; después ejecutar los mismos comandos de instalación y Django. No usar las semillas históricas como actualización de una base con datos propios.

Abrir [http://127.0.0.1:8000/](http://127.0.0.1:8000/) para la página HTML clásica.

## Documentación Swagger

Con la ejecución objetivo iniciada:

- [Swagger UI](http://localhost/api/docs).
- [OpenAPI combinado](http://localhost/api/openapi.json), con autenticación y ambas versiones.
- [OpenAPI v1](http://localhost/api/v1/openapi.json).
- [OpenAPI v2](http://localhost/api/v2/openapi.json).

En desarrollo o con Gunicorn directo usar las mismas rutas en `http://127.0.0.1:8000`. El esquema v1 no es un alias del combinado: se genera de forma independiente.

## Identidad y permisos

accounts contiene login, refresh, logout, CSRF y perfil. Simple JWT valida Bearer; el participante se obtiene mediante la relación uno a uno con el usuario Django. Las contraseñas se guardan con los hashers estándar de Django.

GET de actividades sigue público. POST de actividades requiere is_staff. Las operaciones /me requieren usuario activo y participante asociado. Un participante histórico sin cuenta conserva UUID e inscripciones; una cuenta sin participante no puede inscribirse.

La reserva y cancelación usan una transacción y select_for_update sobre la actividad para serializar cambios de cupo. Se conservan la unicidad actividad/participante y los estados 201/200/204/409.

### Interfaces de autenticación

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/auth/csrf/` | Cookie CSRF necesaria para los POST de autenticación. |
| POST | `/api/auth/login/` | Recibe username/password; responde access y user, y refresh solo en cookie HttpOnly. |
| POST | `/api/auth/refresh/` | Lee el refresh de la cookie; entrega nuevo access y user sin rotar ni extender el refresh. |
| POST | `/api/auth/logout/` | Invalida ese refresh, elimina su cookie y responde 204, también al repetir. |
| GET | `/api/auth/me/` | Identidad del usuario autenticado mediante Bearer. |

Login, refresh y logout comprueban explícitamente CSRF: enviar cookie `csrftoken` y encabezado `X-CSRFToken`. El access dura cinco minutos y React lo guarda solo en memoria. El refresh dura 24 horas, es HttpOnly, SameSite=Lax, tiene Path `/api/auth/` y no tiene Domain; `AUTH_COOKIE_SECURE` permite habilitar Secure con HTTPS.

Logout no revoca inmediatamente un access ya emitido: sigue válido hasta expirar. Tampoco cierra las demás sesiones del usuario. Login y refresh usan `Cache-Control: no-store`.

## Contrato HTTP

La lógica de dominio y la persistencia son compartidas. Las vistas v2 extienden las v1 y cambian el serializador público y los metadatos de OpenAPI. La suite comprueba regresión de v1, coexistencia entre versiones e idempotencia cruzada de PUT/DELETE.

### Rutas v1

| Método | Ruta | Éxito / permiso |
| --- | --- | --- |
| GET | `/api/v1/activities/` | 200, colección con cupos disponibles; público. |
| GET | `/api/v1/activities/{activity_id}/` | 200, actividad; público. |
| GET | `/api/v1/participants/` | 200, participantes; consulta histórica pública. |
| GET | `/api/v1/participants/{participant_id}/` | 200, participante; consulta histórica pública. |
| GET | `/api/v1/me/enrollments/` | 200, inscripciones propias; JWT y participante asociado. |
| PUT | `/api/v1/me/enrollments/{activity_id}/` | 201 nueva o 200 existente; JWT y participante asociado. |
| DELETE | `/api/v1/me/enrollments/{activity_id}/` | 204 sin cuerpo; JWT y participante asociado. |

Las operaciones bajo `/me` requieren `Authorization: Bearer <access>`. `X-Participant-ID` ya no autentica ni selecciona al participante: este surge exclusivamente del usuario validado. Sin credenciales válidas se responde 401; con una cuenta sin participante, 403; una actividad o participante inexistente produce 404 y una actividad sin cupos, 409. Los métodos no habilitados producen 405 y conservan `Allow`.

### Actividades v2

| Método | Ruta | Éxito / permiso |
| --- | --- | --- |
| GET | `/api/v2/activities/` | 200, disponibilidad anidada; público. |
| POST | `/api/v2/activities/` | 201, crea una actividad; JWT y staff. |
| GET | `/api/v2/activities/{activity_id}/` | 200, actividad v2; público. |

v2 también expone GET `/me/enrollments/` y PUT/DELETE `/me/enrollments/{activity_id}/`, con los mismos permisos, cuerpos y estados que v1. La representación de actividad agrega `category` y agrupa el cupo:

```json
{
  "id": "uuid",
  "title": "Laboratorio de React",
  "category": "Frontend",
  "starts_at": "2026-05-12T18:30:00-03:00",
  "availability": { "capacity": 18, "available_slots": 18 }
}
```

POST requiere `title`, `category`, `starts_at` ISO 8601 y `capacity` entero positivo. Un payload inválido responde 400 con `activity_validation_error`; una cuenta autenticada sin staff recibe 403.

### Formato de representación pública

Una actividad v1, tanto en la colección como en el detalle, conserva los cupos en el nivel raíz:

```json
{
  "id": "uuid",
  "title": "Taller de HTTP",
  "starts_at": "2026-04-10T18:00:00-03:00",
  "capacity": 20,
  "available_slots": 3
}
```

Una inscripción, igual en ambas versiones:

```json
{
  "activity_id": "uuid",
  "enrolled_at": "2026-04-03T15:20:00-03:00"
}
```

Las colecciones son arrays directos, sin envoltorios adicionales.

### Formato de error estable

Los errores normalizados usan `code` y `message`:

```json
{
  "code": "capacity_exhausted",
  "message": "No hay lugares disponibles."
}
```

Además de `capacity_exhausted`, `activity_not_found`, `participant_not_found` y `authentication_required`, Hito 2 incluye `invalid_credentials`, `invalid_token`, `refresh_invalid`, `participant_not_linked`, `permission_denied` y `csrf_failed`. Ver [API.md](../API.md) para la tabla completa de estados y validación.

### Idempotencia y cupo

- El primer PUT crea una inscripción con 201. Al repetir responde 200, conserva `enrolled_at` y no duplica filas, incluso si se alternan v1 y v2 o ya no quedan lugares.
- Un DELETE repetido devuelve 204 sin JSON; el efecto final siempre es "sin inscripción". No es necesario que la actividad tenga cupo para cancelar.
- Una transacción con bloqueo de la actividad engloba la consulta de la inscripción, el control del cupo y la creación. La cancelación toma el mismo bloqueo para serializar las operaciones relacionadas.

## Comprobaciones

```powershell
docker compose exec api python manage.py test
docker compose exec api python manage.py makemigrations --check --dry-run
docker compose exec api python manage.py spectacular --validate --fail-on-warn
docker compose exec api python manage.py check --deploy
```

Las pruebas de concurrencia requieren PostgreSQL. Las pruebas CSRF usan enforce_csrf_checks=True. Las de expiración crean tokens vencidos, sin esperar cinco minutos.

## Trazabilidad: `X-Correlation-ID`

Cada respuesta lleva X-Correlation-ID. Los eventos de dominio se emiten en consola y en logs/trace.log. En desarrollo el bind mount refleja ese archivo en el host; en el objetivo pertenece al contenedor y no es persistencia de negocio. No se registran tokens, cookies, contraseñas ni payloads.

### Reglas del encabezado

- Si el request incluye un `X-Correlation-ID` no vacío, Django conserva exactamente ese valor.
- Si falta o está vacío, genera un UUID para la interacción.
- Las respuestas de Django, de éxito o error, devuelven el valor efectivo.
- Es un identificador opaco: no se normaliza ni se interpreta como identidad o permiso.

Con un access válido obtenido mediante el flujo de [API.md](../API.md), el siguiente ejemplo en Bash correlaciona una inscripción. `ACCESS_TOKEN` es una variable temporal del proceso, no un valor para guardar en archivos:

```bash
curl -i -X PUT \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Correlation-ID: demo-42" \
  http://localhost/api/v2/me/enrollments/1b470ddf-3e84-4b77-9aae-091d21e52bd6/

# Primera inscripción: HTTP/1.1 201 Created
# X-Correlation-ID: demo-42
```

En PowerShell usar `curl.exe` y `$env:ACCESS_TOKEN` si se cargó el token en una variable de entorno. En desarrollo sustituir el origen por `http://127.0.0.1:8000`.

### Eventos estructurados y archivo

Cada evento se emite como una línea JSON con campos estables y el mismo `correlation_id`:

```json
{"timestamp":"2026-08-24T13:40:12-03:00","level":"info","event":"enrollment_created","correlation_id":"demo-42","method":"PUT","path":"/api/v2/me/enrollments/1b470ddf-3e84-4b77-9aae-091d21e52bd6/","result":"created","activity_id":"1b470ddf-3e84-4b77-9aae-091d21e52bd6","participant_id":"a1234567-89ab-cdef-0123-456789abcdef"}
```

El logger `tuda.trace` escribe en consola y en `logs/trace.log`, un JSON por línea en UTF-8. El archivo rota al llegar a 1.000.000 de bytes y conserva hasta tres respaldos (`trace.log.1`, `.2`, `.3`). El directorio está excluido de Git y Django lo crea si falta al iniciar.

Con backend local o el bind mount de desarrollo, desde la raíz:

```bash
rg '"correlation_id": "demo-42"' backend/logs/trace.log
```

En la topología objetivo consultar la consola sin depender del archivo del contenedor:

```bash
docker compose logs api | rg demo-42
```

Si no está disponible `rg`, usar `grep demo-42` en macOS/Linux o `Select-String demo-42` en PowerShell.

| Evento | Significado | Valores de result |
| --- | --- | --- |
| `request_received` | Entrada del request, emitida por el middleware | null |
| `participant_auth_checked` | Comprobación de autenticación o vínculo con participante | `ok`, `missing` |
| `activity_lookup` | Búsqueda de la actividad | `found`, `not_found` |
| `enrollment_created` | Inscripción creada | `created` |
| `enrollment_reused` | Inscripción existente, operación idempotente | `reused` |
| `enrollment_rejected` | Inscripción rechazada por cupo | `capacity_exhausted` |
| `enrollment_cancelled` | Cancelación | `cancelled`, `not_enrolled` |
| `request_completed` | Salida con estado HTTP observable | Estado HTTP como texto, o `error` |

Los eventos de dominio dependen del recorrido: una petición rechazada antes de buscar la actividad no emite los de creación. Una inscripción exitosa puede reconstruirse así:

```text
request_received          correlation_id=demo-42
participant_auth_checked  correlation_id=demo-42 result=ok
activity_lookup           correlation_id=demo-42 result=found
enrollment_created        correlation_id=demo-42 result=created
request_completed         correlation_id=demo-42 result=201
```

### Reglas de seguridad

No se registran valores de `Authorization`, cookies, tokens, contraseñas ni payloads de request/response. La ruta del evento usa `request.path`, sin query string. No enviar secretos en `X-Correlation-ID`, porque el valor elegido por el cliente se devuelve y se registra.

## Comandos útiles y mantenimiento

```powershell
docker compose logs -f api
docker compose exec api python manage.py flushexpiredtokens
```

flushexpiredtokens elimina registros de tokens ya vencidos; puede ejecutarse periódicamente en una instalación permanente. Las semillas antiguas son destructivas: para evaluación usar únicamente seed_evaluation.

Desde `backend/` con el entorno local activo:

```bash
python manage.py test
python manage.py shell
```

Para esos comandos dentro de Compose anteponer `docker compose exec api`. Validar también el recorrido HTTP con `docker compose exec api python scripts/verify_http.py`, una vez preparadas las cuentas.

### Reinicio deliberado de una base descartable

**Destructivo: solo si se quiere vaciar expresamente esa base.** Estos comandos históricos no forman parte de un arranque normal ni de una actualización; eliminan datos y requieren un respaldo si se quieren recuperar:

```bash
python manage.py flush --noinput
python manage.py seed_activities
python manage.py seed_participants_and_enrollments
python manage.py seed_evaluation
```

## Estructura relevante

- `activities/models.py`: `Activity`, `Participant` y `Enrollment`; vínculo opcional participante–usuario.
- `activities/views.py`: página HTML clásica, vistas DRF v1/v2 y permisos.
- `activities/api_urls.py`: rutas por versión.
- `activities/serializers.py`: representaciones públicas.
- `activities/services.py`: disponibilidad y operaciones transaccionales de inscripción/cancelación.
- `activities/templates/activities/activity_list.html`: HTML producido por Django.
- `activities/management/commands/seed_evaluation.py`: cuentas y datos locales sin borrar inscripciones.
- `activities/management/commands/seed_activities.py` y `seed_participants_and_enrollments.py`: restauración de la muestra histórica, destructiva si se ejecuta sin precauciones.
- `accounts/`: login, refresh, logout, CSRF, perfil y normalización de errores.
- `config/settings.py`: PostgreSQL, JWT, cookies, CSRF y handlers de logging.
- `correlation/middleware.py`: encabezado y eventos de entrada/salida.
- `correlation/context.py`: contexto de trazabilidad mediante ContextVar.
- `correlation/log.py`: logger estructurado y `log_event()`.

PostgreSQL es el servicio `db`. El objetivo conserva datos en `untdf-pgdata-target`; desarrollo en `untdf-pgdata` y el checkpoint en `untdf-pgdata-gunicorn`, con el prefijo efectivo del proyecto Compose. Son bases distintas; `down` conserva volúmenes y `down -v` los elimina.
