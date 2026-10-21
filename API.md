# Contrato HTTP — Hito 2

Base objetivo: `http://localhost`. Desarrollo: `http://localhost:8000` o `http://localhost:5173` mediante proxy Vite.

Swagger: `/api/docs`. Esquema combinado: `/api/openapi.json`; versiones de actividades: `/api/v1/openapi.json` y `/api/v2/openapi.json`.

## Autenticación

| Método | Ruta | Éxito |
| --- | --- | --- |
| GET | /api/auth/csrf/ | 200; establece csrftoken. |
| POST | /api/auth/login/ | 200; access y user en JSON, refresh en cookie HttpOnly. |
| POST | /api/auth/refresh/ | 200; nuevo access y user, sin renovar el vencimiento del refresh. |
| POST | /api/auth/logout/ | 204; blacklist del refresh y eliminación de cookie. |
| GET | /api/auth/me/ | 200; identidad obtenida del Bearer. |

Login recibe `{"username":"juan","password":"Evaluacion2026!"}`.
Login y refresh responden:

```json
{
  "access": "<JWT access>",
  "user": {
    "id": 1,
    "username": "juan",
    "is_staff": false,
    "participant": {"id": "<UUID>", "name": "Juan García"}
  }
}
```

`participant` puede ser null para cuentas históricas sin vínculo; las operaciones de inscripción de esa cuenta responden 403.

Refresh se lee solo de la cookie `refresh_token`: HttpOnly, SameSite=Lax, Path=/api/auth/, sin Domain. Dura 24 horas; Secure se activa mediante configuración para HTTPS. No se devuelve en JSON ni se recibe desde el body. Login/refresh utilizan Cache-Control: no-store.

Antes de POST a login, refresh o logout, obtener csrftoken mediante GET /api/auth/csrf/ y enviarlo en X-CSRFToken con la cookie. Esas rutas comprueban CSRF incluso sin access token. Las operaciones de negocio se autentican mediante Bearer, no mediante la cookie de refresh.

## Actividades

| Método | Ruta | Permiso / éxito |
| --- | --- | --- |
| GET | /api/v1/activities/ | Público, 200, lista v1. |
| GET | /api/v1/activities/{activity_id}/ | Público, 200. |
| GET | /api/v2/activities/ | Público, 200, lista v2. |
| GET | /api/v2/activities/{activity_id}/ | Público, 200. |
| POST | /api/v2/activities/ | Staff autenticado, 201. |

Actividad v1, sin envoltorios:

```json
{"id":"<UUID>","title":"Taller","starts_at":"2026-10-30T18:00:00-03:00","capacity":20,"available_slots":19}
```

Actividad v2:

```json
{"id":"<UUID>","title":"Taller","category":"Tecnología","starts_at":"2026-10-30T18:00:00-03:00","availability":{"capacity":20,"available_slots":19}}
```

Las colecciones son arrays directos. Crear actividad recibe title, category, starts_at ISO 8601 y capacity entero positivo; devuelve la representación v2. Los errores de validación conservan 400/activity_validation_error.

## Inscripciones propias

Las siguientes rutas existen en v1 y v2. Todas requieren `Authorization: Bearer <access>`.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /api/{version}/me/enrollments/ | 200; array de inscripciones propias. |
| PUT | /api/{version}/me/enrollments/{activity_id}/ | 201 nueva o 200 existente. |
| DELETE | /api/{version}/me/enrollments/{activity_id}/ | 204 sin cuerpo, también al repetir. |

Una inscripción conserva exactamente:

```json
{"activity_id":"<UUID>","enrolled_at":"2026-10-20T18:00:00-03:00"}
```

PUT no requiere body; conserva enrolled_at al repetir, incluso entre versiones. DELETE no usa /cancel/ ni devuelve JSON. El participante surge de la cuenta validada; headers X-Participant-ID, parámetros o identificadores en el body nunca cambian la identidad.

Las consultas históricas GET /api/v1/participants/ y /api/v1/participants/{participant_id}/ conservan su comportamiento público; exponen solamente UUID y nombre, no credenciales.

## Errores y trazabilidad

Los errores usan `{"code":"...","message":"..."}`.

| Estado | Casos / códigos |
| --- | --- |
| 400 | validation_error o activity_validation_error. |
| 401 | authentication_required, invalid_credentials, invalid_token, refresh_invalid. |
| 403 | permission_denied (por ejemplo, crear sin staff), participant_not_linked, csrf_failed. |
| 404 | activity_not_found, participant_not_found. |
| 405 | method_not_allowed, conserva Allow. |
| 409 | capacity_exhausted: no hay lugares disponibles. |

Un Bearer malformado o vencido se rechaza aunque se presente X-Participant-ID. Las respuestas conservan X-Correlation-ID; al enviarlo, el backend lo devuelve sin cambios.

## Logout y límites

Logout es idempotente, requiere CSRF y no necesita un access vigente. El refresh presentado queda en blacklist; reutilizarlo en refresh responde 401. Un access anterior sigue válido hasta expirar a los cinco minutos. No se implementa revocación inmediata de access, logout global ni rotación del refresh.

Ver [la guía de evaluación](docs/hito-2-evaluacion.md) para probar cookies, expiración, roles y aislamiento entre cuentas.
