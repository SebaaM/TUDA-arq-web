import { ActivitiesPage } from "@source/features/activities";
import { useEffect } from "react";
import { refreshSession } from "@source/features/auth/session";
import { useAuth } from "@source/features/auth/useAuth";
import { AuthControls } from "@source/features/auth";
import { SessionInspector } from "@source/features/session-inspector";

export function App() {
  const { user } = useAuth();
  useEffect(() => {
    void refreshSession();
  }, []);
  return (
    <>
      <header className="bg-background">
        <nav
          aria-label="Navegación principal"
          className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-border/70 px-4 py-5 sm:px-6"
        >
          <span className="text-sm font-semibold tracking-wide text-foreground">
            TUDA <span className="text-primary">/ ACTIVIDADES</span>
          </span>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <AuthControls />
            <SessionInspector />
          </div>
        </nav>
      </header>
      <ActivitiesPage key={user?.id ?? "anonymous"} />
    </>
  );
}
