# Backend Django — Hito 2

API Django REST Framework sobre PostgreSQL. Gunicorn ejecuta config.wsgi:application con dos workers en el modo objetivo; runserver se mantiene en desarrollo.

La documentación canónica de rutas y cuerpos está en [API.md](../API.md). Ver [README raíz](../README.md) para variables y arranque completo.

## Ejecución con Docker

Desde la raíz:

```powershell
docker compose up --build -d --wait
docker compose exec api python manage.py seed_evaluation
docker compose exec api python manage.py test
```

El entrypoint aplica migraciones antes del comando recibido. Incluye tablas de usuarios, vínculo opcional participante–usuario y blacklist. No carga semillas al iniciar.

## Identidad y permisos

accounts contiene login, refresh, logout, CSRF y perfil. Simple JWT valida Bearer; el participante se obtiene mediante la relación uno a uno con el usuario Django. Las contraseñas se guardan con los hashers estándar de Django.

GET de actividades sigue público. POST de actividades requiere is_staff. Las operaciones /me requieren usuario activo y participante asociado. Un participante histórico sin cuenta conserva UUID e inscripciones; una cuenta sin participante no puede inscribirse.

La reserva y cancelación usan una transacción y select_for_update sobre la actividad para serializar cambios de cupo. Se conservan la unicidad actividad/participante y los estados 201/200/204/409.

## Comprobaciones

```powershell
docker compose exec api python manage.py test
docker compose exec api python manage.py makemigrations --check --dry-run
docker compose exec api python manage.py spectacular --validate --fail-on-warn
docker compose exec api python manage.py check --deploy
```

Las pruebas de concurrencia requieren PostgreSQL. Las pruebas CSRF usan enforce_csrf_checks=True. Las de expiración crean tokens vencidos, sin esperar cinco minutos.

## Logs y mantenimiento

Cada respuesta lleva X-Correlation-ID. Los eventos de dominio se emiten en consola y en logs/trace.log. En desarrollo el bind mount refleja ese archivo en el host; en el objetivo pertenece al contenedor y no es persistencia de negocio. No se registran tokens, cookies, contraseñas ni payloads.

```powershell
docker compose logs -f api
docker compose exec api python manage.py flushexpiredtokens
```

flushexpiredtokens elimina registros de tokens ya vencidos; puede ejecutarse periódicamente en una instalación permanente. Las semillas antiguas son destructivas: para evaluación usar únicamente seed_evaluation.
