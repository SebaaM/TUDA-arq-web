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
  await parseResponse(
    await fetch("/api/auth/csrf/", {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
  const csrf = document.cookie
    .split("; ")
    .find((item) => item.startsWith("csrftoken="))
    ?.slice("csrftoken=".length);
  return parseResponse<T>(
    await fetch(`/api/auth/${action}/`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": decodeURIComponent(csrf ?? ""),
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
}

export function refreshSession(): Promise<boolean> {
  if (refreshFlight?.generation === generation) return refreshFlight.promise;
  const currentGeneration = generation;
  const promise = (async () => {
    try {
      const result = await authPost<SessionResponse>("refresh");
      if (generation !== currentGeneration) return false;
      publish({ ...result, status: "authenticated", message: null });
      return true;
    } catch (error) {
      if (generation === currentGeneration) {
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
  try {
    await authPost<void>("logout");
  } catch {
    clearSession(
      "Se limpió la sesión local, pero no se pudo confirmar su cierre en el servidor. Reintentá cerrar sesión cuando haya conexión.",
    );
    return false;
  }
  return true;
}
