# Django y API REST

Aplicación React + TypeScript con API Django REST Framework y PostgreSQL. El Hito 2 incorpora autenticación JWT y conserva el contrato e idempotencia del Hito 1.

Proyecto didáctico que compara la vista HTML clásica de Django con un cliente React. La ejecución objetivo usa Nginx, Gunicorn y PostgreSQL; la [guía de ejecución](docs/ejecucion.md) conserva las variantes y el contexto histórico.

## Índice

- [Inicio rápido](#inicio-rápido)
- [Uso y cuentas de evaluación](#uso-y-cuentas-de-evaluación)
- [Arquitectura](#arquitectura)
- [Configuración y seguridad](#configuración-y-seguridad)
- [Pruebas](#pruebas)
- [Operación y diagnóstico](#operación-y-diagnóstico)
- [Documentación](#documentación)

## Inicio rápido

Requiere Git y Docker Desktop con motor Linux y Compose. En Linux también se puede usar Docker Engine con el plugin Compose. El primer build requiere Internet; no hace falta instalar Python, Node ni pnpm en el host para ejecutar el proyecto con Docker.

Desde la raíz del repositorio, elegir el comando de tu sistema:

### Windows / PowerShell

```powershell
.\iniciar.ps1
```

### macOS y Linux

Requiere Bash 3.2 o posterior y `curl`.

```bash
bash iniciar.sh
```

Los scripts crean `.env` **solo si falta**, construyen las imágenes, aplican migraciones, preparan los datos locales de evaluación y comprueban los servicios. Si ya existe información de dominio, conservan las inscripciones y no vuelven a cargar la muestra histórica. Ver las precauciones sobre cuentas en la sección siguiente.

### Desarrollo con recarga

Windows:

```powershell
.\iniciar.ps1 -Modo desarrollo
```

macOS/Linux:

```bash
bash iniciar.sh --modo desarrollo
```

Los scripts gestionan el cambio de modo y sincronizan las dependencias del frontend. **Objetivo y desarrollo usan bases distintas**: los datos de uno no aparecen en el otro.

Para arranque manual con Compose, opciones `SinBuild`/`SinDatos`, problemas de PowerShell o ejecución sin contenedores de aplicación, consultar [Ejecución y diagnóstico](docs/ejecucion.md).

## Uso y cuentas de evaluación

| Modo       | Aplicación                               | Swagger                                                   |
| ---------- | ---------------------------------------- | --------------------------------------------------------- |
| Objetivo   | [localhost](http://localhost/)           | [localhost/api/docs](http://localhost/api/docs)           |
| Desarrollo | [localhost:5173](http://localhost:5173/) | [localhost:8000/api/docs](http://localhost:8000/api/docs) |

Las consultas de actividades son públicas. Para inscribirse, cancelar o consultar inscripciones propias se necesita una cuenta vinculada a un participante; crear actividades requiere staff.

| Usuario | Contraseña local | Permiso                          |
| ------- | ---------------- | -------------------------------- |
| juan    | Evaluacion2026!  | Consultar e inscribirse          |
| maria   | Evaluacion2026!  | Consultar e inscribirse          |
| docente | Evaluacion2026!  | Staff: también crear actividades |

**Solo para evaluación local.** Los scripts crean o restablecen estas cuentas, salvo con `-SinDatos` / `--sin-datos`. Para prepararlas manualmente con el objetivo levantado:

```bash
docker compose exec api python manage.py seed_evaluation
```

`seed_evaluation` restablece sus contraseñas y vincula participantes por UUID sin borrar las inscripciones existentes. No usar las semillas históricas sobre datos a conservar. Ver [detalles de cuentas y semillas](docs/ejecucion.md#datos-y-cuentas-de-evaluación).

En el encabezado de React hay dos herramientas complementarias:

- **Guía de autenticación:** sección pública con diagramas de login, refresh y logout, accesible en `/#guia-autenticacion`.
- **Sesión en vivo:** inspector de los intercambios reales de la pestaña, sin revelar tokens completos ni contraseñas.

El [README del frontend](frontend/README.md#herramientas-didácticas-de-autenticación) explica su uso y sus límites.

## Arquitectura

### Topología objetivo

```text
Navegador → localhost:80 → Nginx
                            ├── / → React compilado (dist/)
                            └── /api/* → api:8000 → Gunicorn / Django
                                                      ├── valida JWT y permisos
                                                      └── db:5432 → PostgreSQL → volumen
```

Solo Nginx publica un puerto. Django y PostgreSQL son accesibles por la red Compose. Nginx conserva el prefijo `/api` y reenvía Authorization, cookies y respuestas Set-Cookie.

PostgreSQL almacena cuentas, participantes, actividades, inscripciones y refresh tokens invalidados. El access se conserva en memoria en React; el refresh está en una cookie HttpOnly del navegador. Django es quien valida la identidad y aplica permisos.

### Archivos de ejecución

| Archivo                        | Responsabilidad                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/Dockerfile`           | Python y dependencias, código Django y proceso Gunicorn con dos workers.                                                                     |
| `backend/docker-entrypoint.sh` | Aplica migraciones y ejecuta el proceso recibido con `exec`. El build normaliza LF.                                                          |
| `frontend/dockerfile`          | Multi-stage: dependencies instala con pnpm; development ejecuta Vite; build genera dist; production usa Nginx. El nombre está en minúsculas. |
| `frontend/nginx.conf`          | Archivos React, fallback SPA y proxy /api hacia Django.                                                                                      |
| `compose.yaml`                 | Ejecución objetivo: db, api y nginx.                                                                                                         |
| `compose.dev.yaml`             | Desarrollo con recarga: db, api y app.                                                                                                       |
| `compose.gunicorn.yaml`        | Checkpoint histórico de Gunicorn sin frontend; API directa en 8000.                                                                          |

## Configuración y seguridad

`.env.example` es la plantilla versionada y `.env` la configuración local: **no sobrescribir un `.env` configurado ni versionarlo**. Las variables y diferencias entre hosts HTTP, PostgreSQL y el proxy Vite están en [Configuración del entorno](docs/configuracion.md).

- Access JWT: solo en memoria de React, 5 minutos por defecto; se envía como Bearer.
- Refresh: cookie HttpOnly de 24 horas por defecto, sin rotación, invalidable mediante blacklist.
- Login, refresh y logout exigen cookie CSRF y `X-CSRFToken`. La cookie refresh no autoriza las operaciones de negocio.
- Logout invalida el refresh de esa sesión; un access ya emitido sigue válido hasta vencer. No hay logout global, registro público ni recuperación de contraseña.

HTTP, cookies sin Secure y credenciales de ejemplo son **solo para el laboratorio local**. Un despliegue público necesita HTTPS, cookies Secure, secretos propios y orígenes configurados. HttpOnly no sustituye CSRF ni elimina el riesgo de XSS.

El contrato v1/v2, los errores, la idempotencia y los flujos de autenticación se documentan en [API.md](API.md); las decisiones y límites están en la [guía de evaluación](docs/hito-2-evaluacion.md#decisiones-y-límites).

## Pruebas

Backend, con el modo objetivo levantado y desde la raíz:

```powershell
docker compose exec api python manage.py test
docker compose exec api python manage.py check --deploy
```

`check --deploy` puede advertir sobre HTTPS, cookies seguras y secretos de evaluación en este laboratorio HTTP. No se deben ocultar esas advertencias.

Frontend, con Node compatible y pnpm instalados, desde `frontend/`:

```powershell
pnpm install --frozen-lockfile
pnpm format
pnpm lint
pnpm test
pnpm build
```

Los controles también pueden ejecutarse en el servicio `app` del modo desarrollo. Para validar migraciones, OpenAPI, concurrencia PostgreSQL y flujos HTTP, seguir la [guía de evaluación](docs/hito-2-evaluacion.md#automatización). Los [resultados registrados](docs/hito-2-validacion.md) indican qué se comprobó y cuándo.

## Operación y diagnóstico

Comandos habituales del modo objetivo:

```powershell
docker compose ps
docker compose logs --tail 50 api nginx
docker compose down
docker compose up -d --wait
```

- `down` conserva los volúmenes; **`down -v` elimina los datos**. No es un paso de actualización.
- Los modos objetivo, desarrollo y Gunicorn mantienen volúmenes separados. Para cambiar manualmente de modo, detener el anterior.
- En desarrollo usar `-f compose.dev.yaml` también para `ps`, `logs`, `exec` y `down`.
- Si falla `app` por dependencias, seguir [la recuperación del volumen del frontend](docs/ejecucion.md#dependencias-del-frontend-en-desarrollo), sin borrar PostgreSQL.
- Para seguir una petición en los logs, usar `X-Correlation-ID`; ver [trazabilidad del backend](backend/README.md#trazabilidad-x-correlation-id). No registrar ni compartir contraseñas, tokens o cookies.

## Documentación

- [Ejecución y diagnóstico](docs/ejecucion.md): scripts, Compose paso a paso, desarrollo, modo local, checkpoint y persistencia.
- [Configuración del entorno](docs/configuracion.md): variables, hosts y seguridad local/HTTPS.
- [Contrato HTTP](API.md): rutas, representaciones, errores y autenticación.
- [Frontend](frontend/README.md) y [backend](backend/README.md): organización y detalles de cada aplicación.
- [Línea base del contrato](docs/contracts/README.md): referencia anterior para detectar regresiones.
- [AGENTS.md](AGENTS.md): convenciones y comprobaciones obligatorias para contribuir.
