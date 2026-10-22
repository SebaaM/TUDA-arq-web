# Configuración del entorno

Referencia para el [README principal](../README.md). No contiene secretos reales: editar la configuración local en `.env`, nunca en este documento.

## Archivos y variables

`.env.example` es la plantilla versionada; `.env` contiene la configuración local y no se versiona. Compose la usa para interpolar valores y el backend recibe sus variables mediante `env_file`. Fuera de Docker, Django puede leer el `.env` de la raíz.

| Variable                                      | Uso                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD | Nombre y credenciales de PostgreSQL.                                                                       |
| POSTGRES_HOST / POSTGRES_PORT                 | Destino desde Django: db / 5432 dentro de Compose. Fuera de Docker usar un host accesible, como 127.0.0.1. |
| DJANGO_SECRET_KEY                             | Secreto Django. La plantilla solo incluye un valor de laboratorio.                                         |
| DJANGO_DEBUG                                  | Desarrollo; el Compose objetivo lo fuerza a false.                                                         |
| DJANGO_ALLOWED_HOSTS                          | Hosts HTTP aceptados; el objetivo usa localhost,127.0.0.1,api.                                             |
| JWT_SIGNING_KEY                               | Clave para firmar JWT; si falta se usa el secreto Django. Usar un secreto propio fuera de evaluación.      |
| JWT_ACCESS_MINUTES / JWT_REFRESH_HOURS        | Duraciones, por defecto 5 minutos y 24 horas.                                                              |
| AUTH_COOKIE_SECURE                            | false para HTTP local; true al desplegar con HTTPS.                                                        |
| DJANGO_CSRF_TRUSTED_ORIGINS                   | Orígenes explícitos de Vite local para las operaciones con cookie.                                         |
| VITE_PROXY_TARGET                             | Destino del proxy de desarrollo; no es una URL que deba conocer el navegador.                              |

## Qué significa cada host

| Variable               | Quién la utiliza | Qué representa                                                                                                          |
| ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `DJANGO_ALLOWED_HOSTS` | Django           | Nombres de host aceptados en las peticiones HTTP; no es el destino de PostgreSQL.                                       |
| `POSTGRES_HOST`        | Django           | Dirección del servidor PostgreSQL: `db` dentro de Compose o un host accesible desde el proceso local.                   |
| `VITE_PROXY_TARGET`    | Vite             | Dirección de Django desde el servidor de desarrollo: `http://api:8000` en Compose o `http://127.0.0.1:8000` en el host. |

El navegador utiliza URLs relativas `/api`; no necesita resolver los nombres internos `api` y `db`. La configuración de hosts HTTP no sustituye las comprobaciones de origen de CSRF.

## Docker y ejecución local

Compose usa el `.env` de la raíz para interpolar valores y lo entrega al backend mediante `env_file`. Las variables de `environment` del servicio pueden sobrescribir esos valores; por ejemplo, el objetivo fuerza `DJANGO_DEBUG=false` y sus hosts permitidos.

Fuera de Docker, Django puede leer ese mismo `.env`; las variables del proceso tienen prioridad. Si se ejecuta Django en la computadora, usar `POSTGRES_HOST=127.0.0.1` o el host real de PostgreSQL. Antes de volver a Docker, restaurar el valor correspondiente a ese modo.

Vite carga los archivos de entorno de `frontend/` y las variables del proceso que lo inicia; no carga automáticamente el `.env` de la raíz. Su proxy local usa por defecto `http://127.0.0.1:8000`.

Usar el mismo hostname en todo el flujo de autenticación: `localhost` y `127.0.0.1` no comparten el alcance de sus cookies. Admitir el origen de Vite en `DJANGO_CSRF_TRUSTED_ORIGINS` cuando se use el modo desarrollo.

## Seguridad y límites del laboratorio

- No sobrescribir un `.env` ya configurado ni versionarlo. `.env.example` es la plantilla, no la configuración de una instalación permanente.
- `AUTH_COOKIE_SECURE=false` corresponde únicamente a HTTP local. Para publicar el proyecto se necesitan HTTPS, cookies Secure, secretos propios y orígenes permitidos ajustados.
- Las duraciones de access y refresh son configurables; los valores por defecto son 5 minutos y 24 horas.
- `check --deploy` puede advertir sobre HTTPS, cookies seguras y secretos de evaluación. No confundir una topología local funcional con un despliegue público endurecido.

Los flujos JWT, CSRF, blacklist y los límites del logout se describen en [API.md](../API.md#autenticación) y en [las decisiones de evaluación](hito-2-evaluacion.md#decisiones-y-límites).
