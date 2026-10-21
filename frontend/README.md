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
- lib/http: Bearer, normalización de errores, respuesta 204 y renovación compartida con un solo reintento.

Al recargar, auth intenta restaurar la sesión mediante la cookie HttpOnly. El access no se persiste en almacenamiento del navegador. Los cambios de usuario reinician los componentes con datos privados.

## Calidad y build

```powershell
pnpm format
pnpm lint
pnpm test
pnpm build
```

Vitest prueba renovaciones simultáneas, respuestas tardías tras logout, fallos de red, 401 y 204. La UI reutiliza primitives shadcn y tokens del proyecto.

frontend/dockerfile usa los targets dependencies, development, build y production. En el objetivo Nginx sirve dist/ y no se ejecuta Vite.
