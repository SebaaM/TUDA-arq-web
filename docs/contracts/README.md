# Línea base del Hito 1

Antes de incorporar JWT se ejecutaron 41 tests contra PostgreSQL en Docker: todos pasaron.
Los JSON `baseline-v1.json` y `baseline-v2.json` son los esquemas HTTP anteriores.

Se conservan rutas, representaciones públicas, estados de negocio, idempotencia y correlación.
Cambios deliberados del Hito 2: Bearer reemplaza `X-Participant-ID`; crear actividades exige staff.
El documento API.md final describe el contrato implementado, no los ejemplos históricos desactualizados.
