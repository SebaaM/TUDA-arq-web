import {
  clearSession,
  getSession,
  getSessionGeneration,
  HttpError,
  parseResponse,
  refreshSession,
} from "@source/features/auth/session";

export async function request<T>(
  path: string,
  init: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const originalUser = getSession().user?.id;
  const originalGeneration = getSessionGeneration();
  const originalAccess = getSession().access;
  async function send() {
    const headers = new Headers(init.headers);
    if (init.body !== undefined)
      headers.set("Content-Type", "application/json");
    if (authenticated && getSession().access)
      headers.set("Authorization", `Bearer ${getSession().access}`);
    return fetch(path, { ...init, headers, credentials: "same-origin" });
  }
  let response = await send();
  if (authenticated && response.status === 401) {
    if (
      getSessionGeneration() !== originalGeneration ||
      getSession().user?.id !== originalUser
    ) {
      throw new HttpError(
        401,
        "session_changed",
        "La sesión cambió. Volvé a intentar la operación.",
      );
    }
    const renewed =
      getSession().access !== originalAccess && getSession().access !== null
        ? true
        : await refreshSession();
    if (renewed && getSession().user?.id === originalUser)
      response = await send();
  }
  if (
    authenticated &&
    (getSessionGeneration() !== originalGeneration ||
      getSession().user?.id !== originalUser)
  ) {
    throw new HttpError(
      401,
      "session_changed",
      "La sesión cambió. Volvé a intentar la operación.",
    );
  }
  if (authenticated && response.status === 401)
    clearSession("Tu sesión venció. Iniciá sesión nuevamente.");
  return parseResponse<T>(response);
}
