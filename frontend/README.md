# Frontend React — Hito 2

React, TypeScript, Vite, Tailwind y shadcn/ui. El gestor de paquetes es pnpm, con versión declarada en package.json.

## Desarrollo

Desde la raíz:

```powershell
docker compose -f compose.dev.yaml up --build -d --wait
```

Abrir http://localhost:5173. Vite reenvía /api a Django. El [README raíz](../README.md) explica usuarios de prueba y configuración.

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
