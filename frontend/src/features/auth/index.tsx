import { useState, type FormEvent } from "react";
import { Button } from "@source/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@source/components/ui/dialog";
import { Input } from "@source/components/ui/input";
import { Label } from "@source/components/ui/label";
import { login, logout } from "@source/features/auth/session";
import { useAuth } from "@source/features/auth/useAuth";

export function AuthControls() {
  const { status, user, message } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(String(data.get("username")), String(data.get("password")));
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo iniciar sesión.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    await logout();
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {message && (
        <p className="max-w-md text-sm text-destructive" role="alert">
          {message}
        </p>
      )}
      {status === "checking" ? (
        <span role="status" className="text-sm">
          Comprobando sesión…
        </span>
      ) : user ? (
        <>
          <span className="text-sm">
            {user.participant?.name ?? user.username}
            {user.is_staff ? " · Staff" : ""}
          </span>
          <Button
            variant="outline"
            onClick={() => void handleLogout()}
            disabled={busy}
          >
            Cerrar sesión
          </Button>
        </>
      ) : (
        <>
          {message?.includes("cierre en el servidor") && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void handleLogout()}
            >
              Reintentar cierre
            </Button>
          )}
          <Button
            disabled={busy}
            onClick={() => {
              setError(null);
              setOpen(true);
            }}
          >
            Iniciar sesión
          </Button>
        </>
      )}
      <Dialog open={open && !user} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar sesión</DialogTitle>
            <DialogDescription>
              Accedé para consultar tus inscripciones y participar.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => void handleLogin(event)}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="username">Usuario</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                disabled={busy}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={busy}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
