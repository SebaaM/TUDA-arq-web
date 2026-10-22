# Frontend React — Hito 2

React, TypeScript, Vite, Tailwind y shadcn/ui. El gestor de paquetes es pnpm, con versión declarada en package.json.

## Desarrollo

Desde la raíz:

```powershell
docker compose -f compose.dev.yaml up --build -d --wait
```

Abrir http://localhost:5173. Vite reenvía /api a Django. El [README raíz](../README.md#uso-y-cuentas-de-evaluación) reúne accesos y cuentas. Consultar [ejecución con recarga](../docs/ejecucion.md#desarrollo-con-recarga) antes de cambiar de modo y [configuración](../docs/configuracion.md) para las variables de entorno.

Si se ejecuta fuera de Docker, iniciar primero PostgreSQL y Django, luego ejecutar desde esta carpeta:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

## Features

- auth: login, logout y estado de sesión en memoria mediante un store externo React.
- activities: listado y detalle públicos, creación para staff y flujo de inscripciones propias.
- auth-guide: guía pública de JWT, refresh HttpOnly y CSRF, accesible desde el encabezado en `/#guia-autenticacion`. Tres diagramas de secuencia con alternativa textual responsive; no usa credenciales reales ni dispara demostraciones.
- session-inspector: panel **Sesión en vivo** para observar los intercambios reales de la pestaña, separado de la guía explicativa.
- lib/http: Bearer, normalización de errores, respuesta 204 y renovación compartida con un solo reintento.

Al recargar, auth intenta restaurar la sesión mediante la cookie HttpOnly. El access no se persiste en almacenamiento del navegador. Los cambios de usuario reinician los componentes con datos privados.

## Herramientas didácticas de autenticación

### Inspector didáctico de sesión

El botón **Sesión en vivo**, en la esquina superior derecha, abre un panel para observar la
autenticación. Muestra el access JWT en memoria (sin revelar su valor), sus horas `iat`/`exp`
y una cuenta regresiva; la cookie CSRF abreviada; y el último estado del refresh informado por
los intercambios de autenticación. Las señales del botón indican envíos y actualizaciones.

El historial registra hasta 40 intercambios de esta pestaña, con método, ruta sin query string,
estado HTTP, tiempo de respuesta y presencia de Bearer/CSRF. No almacena cuerpos, contraseñas
ni valores de credenciales y desaparece al recargar. El refresh es HttpOnly: el panel no puede
leerlo, confirmar que el navegador lo envió ni calcular su vencimiento. Tampoco puede leer los
atributos o la expiración de la cookie CSRF mediante `document.cookie`.

Para demostrar el flujo, iniciar sesión, abrir el inspector y usar **Consultar /me** o **Renovar
access**. Dejar que el access llegue a `00:00` y consultar `/me` permite observar `401 → refresh →
reintento`, si el refresh sigue vigente. El temporizador no renueva tokens ni cambia la sesión.
Al cerrar sesión, el historial distingue la limpieza local del access de la confirmación remota
del logout; un access ya emitido puede seguir aceptándose hasta su vencimiento. La decodificación
del JWT en el panel es informativa: la validación de firma y permisos sigue a cargo de Django.

### Guía de autenticación y seguridad

El enlace **Guía de autenticación** del encabezado abre una sección pública e independiente
en `/#guia-autenticacion` (por ejemplo, [http://localhost/#guia-autenticacion](http://localhost/#guia-autenticacion)
en el modo objetivo). Explica las diferencias entre access JWT, refresh HttpOnly y CSRF, con
tres diagramas: inicio de sesión, renovación con un solo reintento y cierre de sesión. Incluye
los límites de seguridad y las diferencias entre el laboratorio HTTP y un despliegue HTTPS.

En escritorio se muestran secuencias entre navegador, Django y PostgreSQL; en móvil los
mismos pasos se presentan como una lista vertical, también disponible para lectores de
pantalla. La navegación conserva el historial del navegador y permite volver a actividades.
No agrega dependencias ni cambia la autenticación. Los tiempos son los valores por defecto,
no una medición de la sesión. Para observar los intercambios reales se conserva el panel
**Sesión en vivo** descrito arriba: la guía no lo sustituye ni muestra credenciales reales.

### Estado de sesión y fallos de red

Si falla la conexión durante logout, React limpia la sesión local e informa que no pudo confirmar la invalidación remota, con opción de reintentar. Una respuesta tardía de refresh no puede restaurar la sesión después del cierre.

## Calidad y build

```powershell
pnpm format
pnpm lint
pnpm test
pnpm build
```

Vitest prueba renovaciones simultáneas, respuestas tardías tras logout, fallos de red, 401 y 204. También verifica la navegación de la guía, sus tres flujos y la representación textual accesible sin sesión. La UI reutiliza primitives shadcn y tokens del proyecto.

frontend/dockerfile usa los targets dependencies, development, build y production. En el objetivo Nginx sirve dist/ y no se ejecuta Vite.

## Referencia de la plantilla React + TypeScript + Vite

Se conserva a continuación la documentación de la plantilla original como referencia. Los ejemplos de ampliación de ESLint son opcionales: no describen cambios ya aplicados ni requieren instalar plugins adicionales para ejecutar este proyecto. La configuración efectiva está en `vite.config.ts` y `eslint.config.js`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

### React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

### Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
