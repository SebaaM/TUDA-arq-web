import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleAlert,
  Info,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@source/components/ui/badge";
import type { DiagnosticEvent } from "@source/lib/sessionDiagnostics";

export function ExchangeHistory({ events }: { events: DiagnosticEvent[] }) {
  return (
    <section
      aria-labelledby="exchange-history-title"
      className="min-w-0 rounded-xl border"
    >
      <div className="border-b px-4 py-3">
        <h3 id="exchange-history-title" className="font-semibold">
          Intercambios de esta pestaña
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Hasta 40 eventos reales, solo en memoria. Sin valores de tokens,
          contraseñas ni cuerpos HTTP.
        </p>
      </div>
      <ol
        className="max-h-64 overflow-y-auto overscroll-contain divide-y"
        aria-label="Historial de intercambios"
      >
        {events.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted-foreground">
            Todavía no hay eventos. Consultá tu perfil o iniciá sesión para ver
            el recorrido.
          </li>
        )}
        {events.map((event) => (
          <li key={event.id} className="flex min-w-0 gap-3 px-4 py-3">
            <span className="mt-0.5 shrink-0 text-primary" aria-hidden="true">
              {event.phase === "sending" ? (
                <ArrowUpRight className="size-4 motion-safe:animate-pulse" />
              ) : event.phase === "error" ? (
                <CircleAlert className="size-4 text-destructive" />
              ) : event.exchange ? (
                <ArrowDownLeft className="size-4" />
              ) : event.channel === "refresh" ? (
                <RefreshCw className="size-4" />
              ) : (
                <Info className="size-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-words text-xs font-medium">
                  {event.label}
                </span>
                {event.phase === "sending" && (
                  <Badge variant="secondary">Enviando</Badge>
                )}
                {event.exchange?.httpStatus !== undefined && (
                  <Badge
                    variant={
                      event.phase === "error" ? "destructive" : "secondary"
                    }
                  >
                    HTTP {event.exchange.httpStatus}
                  </Badge>
                )}
                {event.exchange?.retry && (
                  <Badge variant="outline">Reintento</Badge>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {event.detail}
              </p>
              {event.exchange && (
                <p className="mt-1 text-xs text-muted-foreground">
                  JWT {event.exchange.bearer ? "enviado" : "no enviado"} · CSRF{" "}
                  {event.exchange.csrf ? "enviado" : "sin header"} · Refresh{" "}
                  {event.exchange.refreshEligible
                    ? "cookie elegible; no verificable desde JS"
                    : "fuera de su Path"}
                  {event.exchange.elapsedMs !== undefined
                    ? ` · ${event.exchange.elapsedMs} ms`
                    : ""}
                </p>
              )}
            </div>
            <time
              dateTime={new Date(event.at).toISOString()}
              className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
            >
              {new Date(event.at).toLocaleTimeString("es-AR")}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
