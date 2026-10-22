import { observedFetch } from "@source/lib/observedFetch";
import { noteDiagnostic, observeRefresh } from "@source/lib/sessionDiagnostics";
import { readCsrfCookie } from "@source/lib/cookies";

export type SessionUser = {
  id: number;
  username: string;
  is_staff: boolean;
  participant: { id: string; name: string } | null;
};

type Session = {
  status: "checking" | "authenticated" | "anonymous";
  access: string | null;
  user: SessionUser | null;
  message: string | null;
};

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let session: Session = {
  status: "checking",
  access: null,
  user: null,
  message: null,
};
let generation = 0;
let refreshFlight: { generation: number; promise: Promise<boolean> } | null =
  null;
const listeners = new Set<() => void>();

export function getSession() {
  return session;
}
export function getSessionGeneration() {
  return generation;
}
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Session) {
  session = next;
  listeners.forEach((listener) => listener());
}

export function clearSession(message: string | null = null) {
  generation += 1;
  publish({ status: "anonymous", access: null, user: null, message });
  noteDiagnostic(
    "access",
    "Access retirado de memoria",
    "El cliente deja de enviarlo. Un access ya emitido puede seguir siendo válido en el servidor hasta su exp.",
  );
}

export async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new HttpError(
      response.status,
      error?.code ?? "request_failed",
      error?.message ?? "No se pudo completar la solicitud.",
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

async function authPost<T>(action: string, body?: unknown): Promise<T> {
  const previousCsrf = readCsrfCookie(document.cookie);
  await parseResponse(
    await observedFetch("/api/auth/csrf/", {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
  const csrf = readCsrfCookie(document.cookie);
  noteDiagnostic(
    "csrf",
    csrf ? "CSRF preparado" : "CSRF no observable",
    csrf
      ? previousCsrf === csrf
        ? "Cookie reutilizada: se envía también en X-CSRFToken."
        : "El navegador recibió una cookie CSRF. El POST enviará X-CSRFToken."
      : "No se encontró csrftoken en document.cookie.",
  );
  return parseResponse<T>(
    await observedFetch(`/api/auth/${action}/`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrf ?? "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

type SessionResponse = { access: string; user: SessionUser };

export async function login(username: string, password: string) {
  const currentGeneration = ++generation;
  const result = await authPost<SessionResponse>("login", {
    username,
    password,
  });
  if (currentGeneration !== generation) return;
  publish({ ...result, status: "authenticated", message: null });
  observeRefresh("accepted");
  noteDiagnostic(
    "refresh",
    "Login aceptado",
    "El servidor responde con access en JSON y configura refresh_token como cookie HttpOnly.",
    "ok",
  );
  noteDiagnostic(
    "access",
    "Access recibido en memoria",
    "Se enviará como Authorization: Bearer en peticiones autenticadas.",
    "ok",
  );
}

export function refreshSession(): Promise<boolean> {
  if (refreshFlight?.generation === generation) return refreshFlight.promise;
  const currentGeneration = generation;
  const promise = (async () => {
    try {
      const result = await authPost<SessionResponse>("refresh");
      if (generation !== currentGeneration) return false;
      publish({ ...result, status: "authenticated", message: null });
      observeRefresh("accepted");
      noteDiagnostic(
        "refresh",
        "Refresh aceptado por Django",
        "Se obtuvo un nuevo access. En este proyecto el refresh no rota ni extiende su vencimiento.",
        "ok",
      );
      noteDiagnostic(
        "access",
        "Access actualizado",
        "La respuesta reemplazó el access en memoria; no se guarda en localStorage.",
        "ok",
      );
      return true;
    } catch (error) {
      if (generation === currentGeneration) {
        observeRefresh(
          error instanceof HttpError && error.status === 401
            ? "invalid"
            : "uncertain",
        );
        noteDiagnostic(
          "refresh",
          "No se pudo renovar",
          error instanceof HttpError && error.status === 401
            ? "El servidor rechazó el refresh: puede faltar, haber vencido o estar invalidado."
            : "No se puede confirmar el estado del refresh por un error de red o de validación.",
          "error",
        );
        const message =
          session.status === "authenticated"
            ? "Tu sesión ya no está disponible. Iniciá sesión nuevamente."
            : error instanceof HttpError && error.status === 401
              ? null
              : "No se pudo comprobar la sesión. Podés intentar iniciar sesión.";
        clearSession(message);
      }
      return false;
    }
  })();
  refreshFlight = { generation: currentGeneration, promise };
  void promise.finally(() => {
    if (refreshFlight?.promise === promise) refreshFlight = null;
  });
  return promise;
}

export async function logout() {
  // Invalidate local requests before awaiting the server or an in-flight refresh.
  clearSession();
  observeRefresh("uncertain");
  try {
    await authPost<void>("logout");
  } catch {
    noteDiagnostic(
      "session",
      "Logout sin confirmación remota",
      "La sesión local está limpia; no se pudo confirmar la invalidación del refresh.",
      "error",
    );
    clearSession(
      "Se limpió la sesión local, pero no se pudo confirmar su cierre en el servidor. Reintentá cerrar sesión cuando haya conexión.",
    );
    return false;
  }
  observeRefresh("closed");
  noteDiagnostic(
    "refresh",
    "Logout confirmado",
    "Django invalidó el refresh de esta sesión y ordenó eliminar su cookie HttpOnly.",
    "ok",
  );
  return true;
}
