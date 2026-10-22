// Educational metadata only: never store tokens, passwords, headers or bodies here.
export type DiagnosticChannel =
  "http" | "access" | "csrf" | "refresh" | "session";
export type RefreshObservation =
  "unknown" | "accepted" | "invalid" | "closed" | "uncertain";
export type Exchange = {
  method: string;
  path: string;
  bearer: boolean;
  csrf: boolean;
  refreshEligible: boolean;
  retry: boolean;
  httpStatus?: number;
  elapsedMs?: number;
};
export type DiagnosticEvent = {
  id: number;
  at: number;
  channel: DiagnosticChannel;
  phase: "sending" | "ok" | "error" | "info";
  label: string;
  detail: string;
  exchange?: Exchange;
};

let nextId = 0;
let snapshot = {
  events: [] as DiagnosticEvent[],
  pending: 0,
  activity: "Sin intercambios pendientes",
  refresh: "unknown" as RefreshObservation,
};
const pending = new Map<number, Exchange>();
const listeners = new Set<() => void>();

export function getDiagnostics() {
  return snapshot;
}
export function subscribeDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(events: DiagnosticEvent[], refresh = snapshot.refresh) {
  const latest = [...pending.values()].at(-1);
  snapshot = {
    events: events.slice(0, 40),
    pending: pending.size,
    activity: latest
      ? `${latest.method} ${latest.path}`
      : "Sin intercambios pendientes",
    refresh,
  };
  listeners.forEach((listener) => listener());
}
export function noteDiagnostic(
  channel: DiagnosticChannel,
  label: string,
  detail: string,
  phase: DiagnosticEvent["phase"] = "info",
) {
  publish([
    { id: ++nextId, at: Date.now(), channel, label, detail, phase },
    ...snapshot.events,
  ]);
}
export function observeRefresh(state: RefreshObservation) {
  publish(snapshot.events, state);
}
export function startExchange(exchange: Exchange) {
  const id = ++nextId;
  pending.set(id, exchange);
  publish([
    {
      id,
      at: Date.now(),
      channel: "http",
      phase: "sending",
      label: `${exchange.method} ${exchange.path}`,
      detail: "Frontend → Django. Esperando respuesta.",
      exchange,
    },
    ...snapshot.events,
  ]);
  return id;
}
export function finishExchange(
  id: number,
  httpStatus: number | undefined,
  elapsedMs: number,
) {
  pending.delete(id);
  publish(
    snapshot.events.map((event) =>
      event.id === id
        ? {
            ...event,
            phase:
              httpStatus !== undefined && httpStatus < 400 ? "ok" : "error",
            detail:
              httpStatus === undefined
                ? "No se recibió respuesta: error de red."
                : `Django → frontend: HTTP ${httpStatus}.`,
            exchange: event.exchange
              ? {
                  ...event.exchange,
                  httpStatus,
                  elapsedMs: Math.round(elapsedMs),
                }
              : undefined,
          }
        : event,
    ),
  );
}
export function clearDiagnosticHistory() {
  // Keep in-flight exchanges so their eventual responses remain visible.
  publish(snapshot.events.filter((event) => pending.has(event.id)));
}
