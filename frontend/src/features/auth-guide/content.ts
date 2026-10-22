export type Actor = "browser" | "django" | "database";

export const actors: { id: Actor; label: string; description: string }[] = [
  { id: "browser", label: "Navegador", description: "React + cookies" },
  { id: "django", label: "Django", description: "JWT + permisos + CSRF" },
  { id: "database", label: "PostgreSQL", description: "Usuarios + blacklist" },
];

export type FlowStep = {
  from: Actor;
  to: Actor;
  label: string;
  hint: string;
  detail: string;
  response?: boolean;
};

export type AuthFlow = {
  id: "login" | "refresh" | "logout";
  title: string;
  description: string;
  note: string;
  steps: FlowStep[];
};

export const credentialGuide = [
  {
    id: "access",
    title: "Access token",
    duration: "5 min por defecto",
    purpose: "Identifica al usuario en las peticiones protegidas.",
    storage:
      "Solo en memoria de React. Desaparece al recargar o cerrar sesión.",
    transport: "Authorization: Bearer <access>",
    boundary: "No se guarda en localStorage, sessionStorage ni IndexedDB.",
  },
  {
    id: "refresh",
    title: "Refresh token",
    duration: "24 h por defecto",
    purpose: "Permite obtener otro access sin volver a escribir la contraseña.",
    storage:
      "Cookie refresh_token HttpOnly: JavaScript no puede leer su valor.",
    transport: "Cookie automática en /api/auth/",
    boundary: "No rota ni extiende su vencimiento. Django puede invalidarlo.",
  },
  {
    id: "csrf",
    title: "Token CSRF",
    duration: "No es una credencial de identidad",
    purpose:
      "Protege login, refresh y logout frente a solicitudes entre sitios.",
    storage: "Cookie csrftoken legible por React para copiarla al header.",
    transport: "Cookie + X-CSRFToken",
    boundary: "Django comprueba el token y el origen. No reemplaza al JWT.",
  },
] as const;

export const authFlows: AuthFlow[] = [
  {
    id: "login",
    title: "Iniciar sesión",
    description:
      "La contraseña se usa para autenticar la cuenta. Después, el access y el refresh cumplen funciones diferentes.",
    note: "Con CSRF válido, credenciales incorrectas devuelven 401 y no emiten tokens nuevos. Un fallo CSRF devuelve 403. Las respuestas con tokens usan Cache-Control: no-store.",
    steps: [
      {
        from: "browser",
        to: "django",
        label: "GET /api/auth/csrf/",
        hint: "Preparar la protección CSRF",
        detail:
          "React pide a Django que establezca la cookie csrftoken antes del POST.",
      },
      {
        from: "django",
        to: "browser",
        label: "Cookie csrftoken",
        hint: "React puede leer esta cookie",
        response: true,
        detail:
          "El navegador conserva csrftoken. Esta cookie no identifica al usuario ni contiene el refresh.",
      },
      {
        from: "browser",
        to: "django",
        label: "POST /api/auth/login/",
        hint: "Usuario + contraseña + CSRF",
        detail:
          "React envía username y password en JSON, la cookie CSRF y el header X-CSRFToken.",
      },
      {
        from: "django",
        to: "django",
        label: "Comprobar CSRF y origen",
        hint: "Validación explícita del POST",
        detail:
          "Django verifica CSRF y el origen permitido antes de procesar las credenciales.",
      },
      {
        from: "django",
        to: "database",
        label: "Consultar la cuenta",
        hint: "Usuario + hash de contraseña",
        detail:
          "Django consulta el usuario y su contraseña almacenada como hash, nunca como texto plano.",
      },
      {
        from: "django",
        to: "django",
        label: "Validar la contraseña",
        hint: "Emitir access y refresh firmados",
        detail:
          "Si la cuenta está activa y la contraseña es correcta, Django emite los dos JWT con sus vencimientos.",
      },
      {
        from: "django",
        to: "database",
        label: "Registrar el refresh emitido",
        hint: "Seguimiento para su invalidación",
        detail:
          "Simple JWT registra el refresh emitido para poder incorporarlo a la blacklist al cerrar sesión.",
      },
      {
        from: "django",
        to: "browser",
        label: "200 · access + usuario",
        hint: "Refresh en Set-Cookie HttpOnly",
        response: true,
        detail:
          "El JSON contiene access y usuario, nunca el refresh. React mantiene el access en memoria y el navegador guarda la cookie HttpOnly.",
      },
    ],
  },
  {
    id: "refresh",
    title: "Renovar y continuar",
    description:
      "Si una operación protegida recibe 401, React intenta una renovación compartida y repite la solicitud una sola vez.",
    note: "Al recargar la página también se intenta restaurar la sesión con refresh. Si falta, venció o está invalidado, Django devuelve 401 y React limpia la sesión y los datos privados. No se reintentan automáticamente 403 ni errores de negocio como 409.",
    steps: [
      {
        from: "browser",
        to: "django",
        label: "Petición protegida con Bearer",
        hint: "El access ya está vencido",
        detail:
          "React adjunta el access a una operación privada. Django comprueba firma, vencimiento y cuenta.",
      },
      {
        from: "django",
        to: "browser",
        label: "401 · access rechazado",
        hint: "No se modifica el recurso",
        response: true,
        detail:
          "Django rechaza la credencial. El cliente puede intentar renovar sin repetir todavía la operación de negocio.",
      },
      {
        from: "browser",
        to: "django",
        label: "POST /api/auth/refresh/",
        hint: "Cookie refresh + CSRF",
        detail:
          "Tras preparar CSRF, React envía el POST con X-CSRFToken. El navegador adjunta el refresh HttpOnly sin exponerlo a React.",
      },
      {
        from: "django",
        to: "django",
        label: "Validar CSRF y refresh",
        hint: "Firma + tipo + vencimiento",
        detail:
          "Django valida CSRF, el tipo de token, su firma y su expiración. El cliente no decide si un token es válido.",
      },
      {
        from: "django",
        to: "database",
        label: "Comprobar cuenta y blacklist",
        hint: "Refresh no invalidado",
        detail:
          "Django comprueba que la cuenta siga activa y que el refresh no esté en la blacklist persistida en PostgreSQL.",
      },
      {
        from: "django",
        to: "browser",
        label: "200 · nuevo access + usuario",
        hint: "Mismo refresh y vencimiento",
        response: true,
        detail:
          "React reemplaza el access en memoria. No se rota el refresh ni se prolonga su vencimiento original.",
      },
      {
        from: "browser",
        to: "django",
        label: "Reintentar una sola vez",
        hint: "Bearer con el nuevo access",
        detail:
          "La solicitud original se repite una vez. Las solicitudes simultáneas comparten una única renovación.",
      },
      {
        from: "django",
        to: "browser",
        label: "Respuesta de la operación",
        hint: "Siguen aplicando los permisos",
        response: true,
        detail:
          "Un JWT válido no garantiza permiso: Django todavía aplica la autorización y las reglas de cupo e inscripciones.",
      },
    ],
  },
  {
    id: "logout",
    title: "Cerrar sesión",
    description:
      "Limpiar el navegador y revocar el refresh en el servidor son dos acciones distintas. El cierre se confirma cuando responde Django.",
    note: "El access anterior sigue siendo válido hasta expirar: como máximo, su duración configurada (5 minutos por defecto). Solo se invalida el refresh de esta sesión, no todas las sesiones del usuario. Si falla la red, la UI informa que el cierre remoto no pudo confirmarse.",
    steps: [
      {
        from: "browser",
        to: "browser",
        label: "Limpiar sesión local",
        hint: "Quitar access y datos privados",
        detail:
          "React retira el access de memoria y los datos privados. Una renovación tardía no puede restaurar esta sesión cerrada.",
      },
      {
        from: "browser",
        to: "django",
        label: "POST /api/auth/logout/",
        hint: "Cookie refresh + CSRF",
        detail:
          "Tras preparar CSRF, React solicita el cierre. El navegador adjunta el refresh y React envía X-CSRFToken.",
      },
      {
        from: "django",
        to: "django",
        label: "Comprobar CSRF",
        hint: "También al repetir el logout",
        detail:
          "La comprobación CSRF se mantiene incluso si la cookie refresh falta o es inválida.",
      },
      {
        from: "django",
        to: "database",
        label: "Invalidar ese refresh",
        hint: "Persistir en la blacklist",
        detail:
          "Si el refresh presentado es válido, Django lo agrega a la blacklist. Su reutilización en refresh devolverá 401.",
      },
      {
        from: "django",
        to: "browser",
        label: "204 · sin cuerpo",
        hint: "Eliminar cookie refresh_token",
        response: true,
        detail:
          "Django ordena eliminar la cookie con el mismo nombre y path. Logout repetido con refresh ausente o inválido también devuelve 204 si CSRF es válido.",
      },
    ],
  },
];
