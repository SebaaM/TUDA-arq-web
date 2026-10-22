import { Clock3, Cookie, KeyRound, LockKeyhole } from "lucide-react";
import { Badge } from "@source/components/ui/badge";
import type { RefreshObservation } from "@source/lib/sessionDiagnostics";
import {
  formatRemaining,
  getAccessTiming,
} from "@source/features/session-inspector/tokens";

const refreshLabels: Record<RefreshObservation, string> = {
  unknown: "No observado",
  accepted: "Aceptado por Django",
  invalid: "Rechazado o ausente",
  closed: "Cierre confirmado",
  uncertain: "Sin confirmar",
};
const time = (value: number) => new Date(value).toLocaleTimeString("es-AR");

export function TokenCards({
  access,
  csrf,
  refresh,
  now,
}: {
  access: string | null;
  csrf: string | null;
  refresh: RefreshObservation;
  now: number;
}) {
  const timing = getAccessTiming(access);
  const expired = timing !== null && timing.expiresAt <= now;
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <section
        aria-label="Access JWT"
        className="rounded-xl border border-primary/30 bg-primary/5 p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <KeyRound className="size-4 text-primary" aria-hidden="true" />
            Access JWT
          </span>
          <Badge variant={expired ? "destructive" : "secondary"}>
            {access
              ? expired
                ? "Vencido"
                : timing
                  ? "Disponible"
                  : "No decodificable"
              : "Ausente"}
          </Badge>
        </div>
        <p className="flex items-center gap-2 font-mono text-3xl tabular-nums">
          <Clock3 className="size-5 text-muted-foreground" aria-hidden="true" />
          {timing ? formatRemaining(timing.expiresAt, now) : "—:—"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {timing
            ? `Vence a las ${time(timing.expiresAt)}${timing.issuedAt ? ` · emitido ${time(timing.issuedAt)}` : ""}`
            : "La cuenta regresiva se obtiene del claim exp."}
        </p>
        <dl className="mt-4 space-y-2 text-xs">
          <div>
            <dt className="font-medium">Dónde vive</dt>
            <dd className="text-muted-foreground">
              Solo en la memoria de esta pestaña.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Cómo viaja</dt>
            <dd className="break-words font-mono text-muted-foreground">
              Authorization: Bearer …
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {expired
            ? "Venció según el reloj local. La próxima petición protegida puede recibir 401 y activar la renovación."
            : "Decodificar exp no valida la firma: Django decide si acepta el token. No se renueva por el temporizador."}
        </p>
      </section>

      <section
        aria-label="Cookie CSRF"
        className="rounded-xl border bg-muted/30 p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <Cookie className="size-4 text-primary" aria-hidden="true" />
            CSRF
          </span>
          <Badge variant="outline">
            {csrf ? "Cookie visible" : "No observable"}
          </Badge>
        </div>
        <p className="break-all font-mono text-lg">
          {csrf ? `${csrf.slice(0, 6)}…` : "csrftoken: —"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Vista abreviada de la cookie legible por JavaScript.
        </p>
        <dl className="mt-4 space-y-2 text-xs">
          <div>
            <dt className="font-medium">Cómo viaja</dt>
            <dd className="text-muted-foreground">
              Cookie + header <span className="font-mono">X-CSRFToken</span>.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Qué protege</dt>
            <dd className="text-muted-foreground">
              Los POST de login, refresh y logout.
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          GET /api/auth/csrf/ la prepara antes de cada POST. Prepararla no
          implica cambiar su valor. document.cookie no expone su fecha de
          expiración ni sus atributos.
        </p>
      </section>

      <section
        aria-label="Cookie refresh HttpOnly"
        className="rounded-xl border bg-muted/30 p-4"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold">
            <LockKeyhole className="size-4 text-primary" aria-hidden="true" />
            Refresh
          </span>
          <Badge variant="outline">HttpOnly</Badge>
        </div>
        <p className="text-base font-medium">{refreshLabels[refresh]}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Estado observado en la última respuesta de autenticación.
        </p>
        <dl className="mt-4 space-y-2 text-xs">
          <div>
            <dt className="font-medium">Dónde vive</dt>
            <dd className="text-muted-foreground">
              Cookie administrada por el navegador.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Cómo viaja</dt>
            <dd className="text-muted-foreground">
              Automáticamente en <span className="font-mono">/api/auth/</span>,
              según sus atributos y alcance.
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          JavaScript no puede leerla ni conocer su vencimiento exacto. El
          servidor renueva el access, pero no rota ni prolonga el refresh. Un
          éxito anterior no garantiza que siga vigente ahora.
        </p>
      </section>
    </div>
  );
}
