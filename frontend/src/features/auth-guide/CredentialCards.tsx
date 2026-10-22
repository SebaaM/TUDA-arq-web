import { Cookie, KeyRound, ShieldCheck } from "lucide-react";
import { Badge } from "@source/components/ui/badge";
import { Card, CardContent, CardHeader } from "@source/components/ui/card";
import { credentialGuide } from "@source/features/auth-guide/content";

const icons = { access: KeyRound, refresh: Cookie, csrf: ShieldCheck };

export function CredentialCards() {
  return (
    <section aria-labelledby="credentials-heading" className="space-y-5">
      <div>
        <h2 id="credentials-heading" className="text-xl font-semibold">
          Tres piezas, tres responsabilidades
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Estas son las reglas del proyecto; no muestran el estado de tu sesión
          actual.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {credentialGuide.map((credential) => {
          const Icon = icons[credential.id];
          return (
            <Card key={credential.id} className="h-full">
              <CardHeader className="gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-base font-semibold">
                    {credential.title}
                  </h3>
                </div>
                <Badge
                  variant="secondary"
                  className="h-auto max-w-full whitespace-normal"
                >
                  {credential.duration}
                </Badge>
                <p className="leading-relaxed text-muted-foreground">
                  {credential.purpose}
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="leading-relaxed">{credential.storage}</p>
                <code className="block break-words rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
                  {credential.transport}
                </code>
                <p className="mt-auto border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                  {credential.boundary}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
