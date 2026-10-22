import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  ArrowRight,
  Eraser,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Badge } from "@source/components/ui/badge";
import { Button } from "@source/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@source/components/ui/dialog";
import {
  refreshSession,
  type SessionUser,
} from "@source/features/auth/session";
import { useAuth } from "@source/features/auth/useAuth";
import { request } from "@source/lib/http";
import {
  clearDiagnosticHistory,
  getDiagnostics,
  noteDiagnostic,
  subscribeDiagnostics,
} from "@source/lib/sessionDiagnostics";
import { ExchangeHistory } from "@source/features/session-inspector/ExchangeHistory";
import { TokenCards } from "@source/features/session-inspector/TokenCards";
import {
  formatRemaining,
  getAccessTiming,
} from "@source/features/session-inspector/tokens";
import { readCsrfCookie } from "@source/lib/cookies";

export function SessionInspector() {
  const session = useAuth();
  const diagnostics = useSyncExternalStore(
    subscribeDiagnostics,
    getDiagnostics,
  );
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lastExpired = useRef<number | null>(null);
  const timing = getAccessTiming(session.access);
  const expiresAt = timing?.expiresAt;
  const expired = expiresAt !== undefined && now >= expiresAt;
  const pending = diagnostics.pending > 0;
  const recentAccess = diagnostics.events.some(
    (event) =>
      event.channel === "access" &&
      event.phase === "ok" &&
      now - event.at < 3000,
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (expired && expiresAt !== lastExpired.current) {
      lastExpired.current = expiresAt ?? null;
      noteDiagnostic(
        "access",
        "El access llegó a exp",
        "Venció según el reloj del navegador. No se envió ninguna petición por este temporizador: la renovación ocurre al recibir 401 o al usar el botón.",
      );
    }
  }, [expired, expiresAt]);

  async function demonstrate(action: "refresh" | "profile") {
    setBusy(true);
    setFeedback(null);
    try {
      if (action === "refresh") {
        const renewed = await refreshSession();
        setFeedback(
          renewed
            ? "Django aceptó el refresh y se actualizó el access en memoria."
            : "No se pudo renovar. Revisá la respuesta y el estado de la sesión en el historial.",
        );
      } else {
        const profile = await request<SessionUser>("/api/auth/me/", {}, true);
        setFeedback(
          `Django validó el Bearer e identificó a ${profile.username}.`,
        );
      }
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "No se pudo completar la demostración.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={() => setFeedback(null)}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="gap-2 border-primary/40 bg-primary/5"
          />
        }
      >
        {pending ? (
          <Activity
            className="size-4 motion-safe:animate-pulse text-primary"
            aria-hidden="true"
          />
        ) : recentAccess ? (
          <RefreshCw
            className="size-4 motion-safe:animate-pulse text-primary"
            aria-hidden="true"
          />
        ) : (
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        )}
        Sesión en vivo
        <span
          className={
            expired
              ? "font-mono text-xs tabular-nums text-destructive"
              : "font-mono text-xs tabular-nums text-muted-foreground"
          }
          aria-hidden="true"
        >
          {recentAccess
            ? "JWT ↑"
            : timing
              ? formatRemaining(timing.expiresAt, now)
              : "JWT —"}
        </span>
        <span className="sr-only">
          Abrir explicación de JWT, cookies e intercambios de la sesión
        </span>
      </DialogTrigger>
      <DialogContent
        initialFocus={titleRef}
        className="max-h-[90svh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl"
      >
        <DialogHeader className="pr-7">
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            className="flex items-center gap-2"
          >
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            Sesión en vivo
          </DialogTitle>
          <DialogDescription>
            Una ventana al recorrido de tus credenciales: dónde viven, cuándo
            viajan y cómo Django las valida.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={expired ? "destructive" : "secondary"}>
              {session.status === "checking"
                ? "Comprobando sesión"
                : expired
                  ? "Access vencido"
                  : session.user
                    ? "Sesión autenticada"
                    : "Sin sesión autenticada"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {session.user?.username ?? "Visitante"}
            </span>
          </div>
          <span
            className="flex items-center gap-2 text-xs text-muted-foreground"
            role="status"
          >
            {pending ? (
              <LoaderCircle
                className="size-3 motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <span
                className="size-1.5 rounded-full bg-primary"
                aria-hidden="true"
              />
            )}
            {pending
              ? `${diagnostics.pending} intercambio(s) en curso`
              : "Escuchando intercambios"}
          </span>
        </div>

        <TokenCards
          access={session.access}
          csrf={readCsrfCookie(document.cookie)}
          refresh={diagnostics.refresh}
          now={now}
        />

        <section
          aria-label="Recorrido de una petición"
          className="rounded-xl border px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
            <span>React</span>
            <ArrowRight className="size-3 text-primary" aria-hidden="true" />
            <span>Bearer o cookie + CSRF</span>
            <ArrowRight className="size-3 text-primary" aria-hidden="true" />
            <span>Nginx / Vite</span>
            <ArrowRight className="size-3 text-primary" aria-hidden="true" />
            <span>Django valida</span>
            <ArrowRight className="size-3 text-primary" aria-hidden="true" />
            <span>Respuesta</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Un 401 en una petición protegida activa un refresh compartido y un
            único reintento con el nuevo Bearer. Al cerrar sesión se retira el
            access local y se invalida el refresh; un access ya emitido puede
            seguir válido hasta su vencimiento.
          </p>
        </section>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy || pending || !session.user}
            onClick={() => void demonstrate("profile")}
          >
            <UserRound aria-hidden="true" />
            Consultar /me
          </Button>
          <Button
            variant="outline"
            disabled={busy || pending || !session.user}
            onClick={() => void demonstrate("refresh")}
          >
            <RefreshCw aria-hidden="true" />
            Renovar access
          </Button>
          <Button
            variant="ghost"
            className="sm:ml-auto"
            onClick={clearDiagnosticHistory}
          >
            <Eraser aria-hidden="true" />
            Limpiar historial
          </Button>
        </div>
        {feedback && (
          <p
            className="rounded-lg border bg-muted/30 p-3 text-sm"
            role="status"
          >
            {feedback}
          </p>
        )}
        <ExchangeHistory events={diagnostics.events} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Este panel muestra observaciones del frontend, no una lista completa
          de cookies del navegador. La presencia y los atributos de una cookie
          HttpOnly se inspeccionan en las herramientas del navegador; no se
          exponen desde JavaScript. El historial se pierde al recargar la
          página.
        </p>
      </DialogContent>
    </Dialog>
  );
}
