import { LockKeyhole, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@source/components/ui/card";

const notes = [
  {
    title: "JWT firmado no significa cifrado",
    description:
      "El contenido del JWT se puede decodificar. La firma permite detectar alteraciones; Django la valida. No incluir secretos en sus claims.",
  },
  {
    title: "Autenticación no es autorización",
    description:
      "El JWT identifica la cuenta. Django decide los permisos: actividades públicas para consultar, creación solo para staff e inscripciones del participante vinculado al usuario, nunca de un ID elegido por el cliente.",
  },
  {
    title: "HttpOnly y CSRF no resuelven XSS",
    description:
      "HttpOnly impide leer el refresh con JavaScript, pero no impide que un script malicioso haga solicitudes. CSRF protege frente a solicitudes entre sitios, no frente a scripts inyectados en el propio sitio.",
  },
  {
    title: "Local HTTP no es una configuración de producción",
    description:
      "Aquí la cookie refresh es HttpOnly, SameSite=Lax, Path=/api/auth/ y sin Domain. Secure se desactiva solo para HTTP local. En un despliegue real se necesita HTTPS, Secure y configurar los orígenes CSRF y los secretos.",
  },
];

export function SecurityNotes() {
  return (
    <section aria-labelledby="security-heading" className="space-y-5">
      <div className="flex items-center gap-3">
        <ShieldCheck
          className="size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <h2 id="security-heading" className="text-xl font-semibold">
          Qué protege cada capa, y qué no
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {notes.map((note) => (
          <Card key={note.title}>
            <CardHeader>
              <h3 className="font-semibold">{note.title}</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {note.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Nginx en el modo objetivo y Vite en desarrollo reenvían /api a Django.
        El proxy no valida los JWT ni reemplaza las comprobaciones de permisos
        del backend. Los logs no deben incluir contraseñas, tokens ni cookies.
      </p>
    </section>
  );
}
