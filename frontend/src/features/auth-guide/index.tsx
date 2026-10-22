import { useEffect, useRef } from "react";
import { ArrowLeft, BookOpen, Info } from "lucide-react";
import { Badge } from "@source/components/ui/badge";
import { Button } from "@source/components/ui/button";
import { CredentialCards } from "@source/features/auth-guide/CredentialCards";
import { SequenceDiagram } from "@source/features/auth-guide/SequenceDiagram";
import { SecurityNotes } from "@source/features/auth-guide/SecurityNotes";
import { authFlows } from "@source/features/auth-guide/content";
import { pageHashes } from "@source/lib/navigation";

export function AuthGuidePage() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-8 sm:px-6 sm:py-12">
        <section aria-labelledby="auth-guide-heading" className="space-y-5">
          <Button
            variant="ghost"
            nativeButton={false}
            role="link"
            render={<a href={pageHashes.activities} />}
          >
            <ArrowLeft aria-hidden="true" />
            Volver a actividades
          </Button>
          <div className="flex flex-wrap items-center gap-2 text-primary">
            <BookOpen className="mr-1 size-4" aria-hidden="true" />
            <span className="text-xs font-semibold tracking-widest uppercase">
              Guía del proyecto
            </span>
            <Badge variant="outline">Pública · solo lectura</Badge>
          </div>
          <h1
            id="auth-guide-heading"
            ref={titleRef}
            tabIndex={-1}
            className="max-w-3xl rounded-md text-3xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-4xl"
          >
            Autenticación y seguridad
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Qué sucede al iniciar sesión, renovar credenciales y salir. Un
            recorrido por JWT, cookies y CSRF en esta aplicación, sin exponer
            contraseñas ni tokens reales.
          </p>
          <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed">
            <Info
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p>
              <strong className="font-medium">
                Guía explicativa, no actividad real.
              </strong>
              <span className="text-muted-foreground">
                {" "}
                Para observar los intercambios de tu pestaña, abrí{" "}
                <strong className="font-medium text-foreground">
                  Sesión en vivo
                </strong>{" "}
                en el encabezado. Esta página no envía peticiones de
                demostración ni necesita iniciar sesión.
              </span>
            </p>
          </div>
        </section>

        <CredentialCards />

        <section aria-labelledby="flows-heading" className="space-y-5">
          <div>
            <h2 id="flows-heading" className="text-xl font-semibold">
              El recorrido de una sesión
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              En los tres flujos, Django es quien valida. Antes de cada POST de
              autenticación, React prepara CSRF mediante GET /api/auth/csrf/; en
              el primer diagrama se ve ese intercambio completo.
            </p>
          </div>
          <div className="space-y-6">
            {authFlows.map((flow, index) => (
              <SequenceDiagram key={flow.id} flow={flow} number={index + 1} />
            ))}
          </div>
        </section>

        <SecurityNotes />

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">
            Los tiempos indicados son los valores por defecto, configurables en
            el backend.
          </p>
          <Button
            variant="outline"
            nativeButton={false}
            role="link"
            render={<a href={pageHashes.activities} />}
          >
            <ArrowLeft aria-hidden="true" />
            Volver a actividades
          </Button>
        </footer>
      </div>
    </main>
  );
}
