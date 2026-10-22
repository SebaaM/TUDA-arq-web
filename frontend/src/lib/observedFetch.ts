import { finishExchange, startExchange } from "@source/lib/sessionDiagnostics";

// Observe the existing transport without reading or cloning request/response bodies.
export async function observedFetch(
  path: string,
  init: RequestInit = {},
  retry = false,
): Promise<Response> {
  const pathname = new URL(path, "http://localhost").pathname;
  const headers = new Headers(init.headers);
  const id = startExchange({
    method: (init.method ?? "GET").toUpperCase(),
    path: pathname,
    bearer: headers.has("Authorization"),
    csrf: headers.has("X-CSRFToken"),
    refreshEligible: pathname.startsWith("/api/auth/"),
    retry,
  });
  const started = performance.now();
  try {
    const response = await fetch(path, init);
    finishExchange(id, response.status, performance.now() - started);
    return response;
  } catch (error) {
    finishExchange(id, undefined, performance.now() - started);
    throw error;
  }
}
