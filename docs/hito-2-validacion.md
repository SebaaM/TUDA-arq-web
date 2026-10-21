# Resultados de validación — 21 de octubre de 2026

## Pruebas automatizadas

- Línea base previa a JWT: 41 tests aprobados contra PostgreSQL en Compose.
- Suite completa después de la implementación: 64 tests aprobados contra PostgreSQL.
- Comprobación adicional de autenticación y migración con la imagen objetivo: 13 tests aprobados.
- Frontend: pnpm format, pnpm lint, pnpm test (8 tests) y pnpm build aprobados.
- Nginx: nginx -t aprobado.
- Migraciones: makemigrations --check --dry-run informa No changes detected.
- OpenAPI: spectacular --validate --fail-on-warn aprobado.
- Configuraciones Compose de desarrollo y objetivo válidas.

Las pruebas incluyen cookies HttpOnly, comprobación CSRF real, expiración simulada, usuario inactivo, refresh invalidado, staff, aislamiento entre usuarios, formatos v1/v2, correlación, PUT/DELETE idempotentes y solicitudes concurrentes al último cupo.

## Integración HTTP y navegador

verify_http.py pasó por Nginx y por el proxy Vite. Comprobó login incorrecto/correcto, CSRF, creación solo staff, identidad independiente de X-Participant-ID, cupo agotado, idempotencia entre versiones, renovación, logout y el límite del access anterior al logout.

En navegador se verificaron login incorrecto, login de Juan, inscripción y cancelación, restauración al recargar, creación visible para Docente/staff, logout y login de María por Vite con su Origin real. Se revisó el diálogo staff en escritorio y a 390 × 844 px: sin overflow horizontal y cierre por Escape devolviendo el foco al botón de apertura.

## Persistencia

Se recrearon los contenedores originales mediante down y up, sin eliminar volúmenes. La inscripción creada para la prueba siguió existiendo y la cantidad de registros de blacklist se mantuvo en 3 antes y después del recreado. La sesión del navegador se restauró. Después se canceló únicamente la inscripción creada durante la prueba.

## Copia limpia

Se exportó el commit 7725ba6 mediante git archive a un directorio temporal. La copia no tenía .venv, node_modules, dist ni .env local. Se copió solamente .env.example a .env.

- Proyecto aislado hito2-copia-limpia: build, volumen PostgreSQL nuevo, migraciones automáticas, seed_evaluation y prueba HTTP por Nginx aprobados.
- Proyecto aislado hito2-desarrollo-limpio: build de desarrollo, volúmenes nuevos, migraciones, seed_evaluation, prueba HTTP por Vite y login desde navegador aprobados.
- Los contenedores y volúmenes de esos dos proyectos temporales se eliminaron al terminar. Los volúmenes originales de desarrollo y objetivo no se eliminaron.

## Advertencias de despliegue local

Con .env.example, check --deploy emite cuatro advertencias relacionadas con HTTP local: HSTS, redirección HTTPS y cookies secure de sesión/CSRF. DEBUG está desactivado en el objetivo. El .env local preexistente también advierte sobre su secreto corto; no se sobrescribió la configuración del usuario.

Estas advertencias no se silenciaron. La plantilla y la guía distinguen evaluación local de un despliegue público con secretos propios y HTTPS. Los límites de revocación de access, ausencia de rotación y logout por sesión están documentados en README y API.md.

Los resultados describen esta ejecución y pueden reproducirse con los comandos de docs/hito-2-evaluacion.md.

## Revisión de README y cuentas en los scripts de arranque

Se contrastaron los tres README modificados con la versión anterior al cambio documental del Hito 2 (`0a7d730`). Se recuperaron el arranque automático para Windows/macOS/Linux, los pasos manuales, la ejecución local sin contenedores de aplicación, las topologías, el checkpoint Gunicorn, el versionado de API, el contexto didáctico y la documentación detallada de trazabilidad. El README del frontend conserva además las referencias de su plantilla original, diferenciadas de la configuración efectiva.

Los scripts ahora ejecutan `seed_evaluation` después de la carga histórica protegida. La muestra histórica sigue limitada al caso en que las tres tablas de dominio están vacías. `-SinDatos` y `--sin-datos` omiten también la creación o el restablecimiento de cuentas.

Validación realizada en Windows, en el proyecto Compose aislado `hito2-arranque-verificacion`, con un volumen nuevo y sin usar las bases originales:

- Sintaxis de PowerShell y `bash -n` aprobadas.
- `iniciar.ps1` construyó, migró y levantó la topología objetivo, cargó tres actividades y siete inscripciones de muestra y preparó las tres cuentas locales.
- `iniciar.sh --sin-build`, ejecutado mediante Git Bash con Docker Desktop, detectó los datos existentes, omitió las semillas destructivas y preparó las mismas cuentas. No se verificó el inicio del motor Docker en macOS/Linux nativos.
- Se comprobaron contraseñas válidas, participante asociado para cada cuenta y permiso staff de `docente`.
- La comparación de ID, actividad, participante y `enrolled_at` confirmó que las siete inscripciones permanecieron idénticas entre ejecuciones.
- Las variantes `-SinBuild -SinDatos` y `--sin-build --sin-datos` no modificaron las inscripciones ni los hashes de contraseña.
- La suite backend volvió a aprobar sus 64 tests en PostgreSQL, y la prueba HTTP por Nginx pasó con las cuentas creadas por los scripts.
- `pnpm format`, `pnpm lint`, `pnpm test` (8 tests) y `pnpm build` aprobados. Los enlaces locales y bloques de código de los README se comprobaron, junto con `git diff --check`.

El entorno temporal se retira al finalizar la validación; los volúmenes originales no se modifican. La restauración de documentación no incorpora la carpeta experimental.

## Recuperación de un volumen de dependencias existente

El arranque real de desarrollo detectó un caso no cubierto por las pruebas con volúmenes nuevos: `frontend_node_modules` conservaba una instalación de pnpm 12.14.0 y otro lockfile, mientras el proyecto y la imagen usan pnpm 11.22.0. `app` intentaba reinstalar dependencias y fallaba con `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.

Se corrigieron ambos scripts para preparar las dependencias antes de `up --wait`: construir las imágenes si corresponde, detener solo `app` y ejecutar `pnpm install --frozen-lockfile` con `CI=true`. El servicio de desarrollo fija `pnpm_config_store_dir=/root/.local/share/pnpm/store` para mantener el mismo store durante instalación y ejecución. El prefijo `npm_config_` no configura este ajuste en pnpm 11. Las rutas se configuran en Compose para evitar conversiones de argumentos Linux desde Git Bash.

- Se recuperó el volumen existente sin eliminarlo ni tocar los volúmenes PostgreSQL.
- PowerShell 5.1 y Git Bash completaron el arranque con `SinBuild`/`SinDatos`, incluidos HTTP 200 para frontend y API por Vite.
- Se comprobó la versión final pnpm 11.22.0, el store esperado y la ausencia de `.pnpm-store` dentro del frontend. Se excluyó esa caché del contexto Docker como protección adicional.
- Una huella de todos los registros de usuarios, actividades, participantes, inscripciones y tablas JWT fue idéntica antes y después de reparar el frontend: tres usuarios, tres actividades, cinco participantes y siete inscripciones, sin cambios de contraseñas ni fechas.
- Formato, lint, ocho tests y build pasaron en el host; los ocho tests y el build también se repitieron dentro del contenedor reparado.
- El desarrollo quedó levantado en `http://localhost:5173/`, con la API y Swagger en `http://localhost:8000/`.
