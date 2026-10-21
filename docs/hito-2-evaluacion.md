# Guía de evaluación del Hito 2

## Preparación

Seguir el README raíz. Ejecutar seed_evaluation explícitamente. Usuarios: juan y maria (participantes), docente (staff). Contraseña local de todos: Evaluacion2026!.

La interfaz objetivo abre en http://localhost. Las verificaciones siguientes pueden repetirse en desarrollo desde http://localhost:5173. Usar siempre el mismo hostname para conservar cookies.

## Evidencias en navegador

1. Sin sesión, consultar actividades. No debe aparecer Crear actividad. Consultar /api/v2/me/enrollments/ sin Bearer devuelve 401.
2. Iniciar sesión con contraseña incorrecta: mostrar error y no iniciar sesión.
3. Iniciar sesión como juan. Revisar Network: login devuelve access y user, sin refresh en JSON.
4. En Application/Storage, confirmar refresh_token HttpOnly, Path=/api/auth/, SameSite=Lax. En HTTP local Secure es false. JavaScript no debe poder leer esa cookie.
5. Revisar Local Storage, Session Storage e IndexedDB: no contienen JWT. El access vive en memoria.
6. Inscribirse en una actividad. Confirmar que aparece en Mis inscripciones y se actualiza el cupo.
7. Cancelar y volver a cancelar mediante API: 204 sin JSON. Repetir PUT autenticado: 201 y luego 200 con el mismo enrolled_at.
8. Recargar: React obtiene un access mediante refresh y restaura la cuenta.
9. Cerrar sesión e ingresar como maria: no se muestran las inscripciones de juan.
10. Maria no ve Crear actividad; un POST manual con su Bearer responde 403. Docente sí puede crear.
11. En Network observar X-Correlation-ID y buscarlo en docker compose logs api.

Para repetir un PUT con un header X-Participant-ID de otra cuenta, conservar el Bearer del usuario A: la operación sigue perteneciendo a A. El header sin Bearer responde 401.

## Refresh, CSRF y logout

En la consola del navegador se puede obtener CSRF sin exponer el refresh:

```javascript
await fetch('/api/auth/csrf/');
const csrf = decodeURIComponent(document.cookie.split('; ').find(x => x.startsWith('csrftoken=')).slice(10));
const response = await fetch('/api/auth/refresh/', {
  method: 'POST',
  headers: { 'X-CSRFToken': csrf }
});
console.log(response.status);
```

Con sesión vigente devuelve 200. El navegador envía la cookie; no copiar ni registrar su valor. Sin X-CSRFToken, los POST de autenticación responden 403.

Después de logout, refresh devuelve 401. En la suite automatizada se conserva una copia del refresh anterior y se demuestra que su reutilización también se rechaza.

Para el límite de access, las pruebas usan un token emitido antes del logout: /api/auth/me/ todavía responde 200. Con ese access vencido responde 401. La sesión React se limpia inmediatamente, aunque un cliente que guardó el access pudiera usarlo hasta cinco minutos.

La suite también comprueba refresh vencido, manipulado, usuario inactivo y cierres de sesión repetidos. No hace falta esperar tiempos reales.

## Persistencia

Crear una inscripción y cerrar sesión. Ejecutar:

```powershell
docker compose down
docker compose up -d --wait
```

Sin volver a sembrar, iniciar sesión y comprobar que la inscripción permanece. Un refresh invalidado seguirá en blacklist, porque los registros viven en PostgreSQL.

down -v es una eliminación deliberada de los volúmenes del modo seleccionado. No es un paso de actualización y elimina usuarios, inscripciones y registros de blacklist. No ejecutar sobre datos a conservar.

## Automatización

```powershell
docker compose exec api python manage.py test
docker compose exec api python manage.py makemigrations --check --dry-run
docker compose exec api python manage.py spectacular --validate --fail-on-warn
docker compose exec api python manage.py check --deploy
docker compose exec api python scripts/verify_http.py
```

Desde frontend: pnpm format, pnpm lint, pnpm test y pnpm build.

Las pruebas PostgreSQL incluyen disputa del último cupo, PUT concurrente repetido, aislamiento entre usuarios y conservación de datos al agregar la relación de cuenta.

verify_http.py usa las cuentas de evaluación, crea una actividad temporal mediante staff y verifica el flujo HTTP completo por Nginx. Finalmente invalida sus sesiones y elimina únicamente esa actividad temporal. No imprime tokens ni modifica las inscripciones previas.

## Decisiones y límites

- La consulta pública no depende de login, y las cookies no autorizan por sí mismas las operaciones de negocio.
- El backend determina la identidad; Nginx solo enruta.
- Refresh fijo por 24 horas, sin rotación; puede renovarse access hasta su vencimiento o blacklist.
- Logout afecta al refresh de esa sesión; no revoca inmediatamente access ni todas las sesiones del usuario.
- HTTP y secretos de ejemplo se usan solo para evaluación local. Un despliegue público necesita secretos propios, HTTPS y cookies Secure.
- HttpOnly reduce la exposición del refresh a JavaScript; no elimina XSS ni sustituye CSRF.
- No se implementan registro público, recuperación de contraseña ni roles adicionales.
- La lista histórica pública de participantes expone UUID y nombre, como en el contrato anterior.
