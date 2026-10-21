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
