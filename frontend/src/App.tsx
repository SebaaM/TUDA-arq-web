import { ActivitiesPage } from "@source/features/activities";
import { useEffect, useRef } from "react";
import { BookOpen } from "lucide-react";
import { refreshSession } from "@source/features/auth/session";
import { useAuth } from "@source/features/auth/useAuth";
import { AuthControls } from "@source/features/auth";
import { SessionInspector } from "@source/features/session-inspector";
import { AuthGuidePage } from "@source/features/auth-guide";
import { Button } from "@source/components/ui/button";
import { pageHashes, useCurrentPage } from "@source/lib/navigation";

export function App() {
  const { user } = useAuth();
  const page = useCurrentPage();
  const mainRegionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    void refreshSession();
  }, []);
  useEffect(() => {
    if (page === "activities" && window.location.hash) {
      const heading = mainRegionRef.current?.querySelector("h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
      window.scrollTo(0, 0);
    }
  }, [page]);
  return (
    <>
      <header className="bg-background">
        <nav
          aria-label="Navegación principal"
          className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-border/70 px-4 py-5 sm:px-6"
        >
          <a
            href={pageHashes.activities}
            aria-label="TUDA: actividades"
            className="rounded-sm text-sm font-semibold tracking-wide text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            TUDA <span className="text-primary">/ ACTIVIDADES</span>
          </a>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <Button
              variant={page === "auth-guide" ? "secondary" : "ghost"}
              nativeButton={false}
              role="link"
              render={
                <a
                  href={pageHashes["auth-guide"]}
                  aria-current={page === "auth-guide" ? "page" : undefined}
                />
              }
            >
              <BookOpen aria-hidden="true" />
              Guía de autenticación
            </Button>
            <AuthControls />
            <SessionInspector />
          </div>
        </nav>
      </header>
      <div ref={mainRegionRef}>
        {page === "auth-guide" ? (
          <AuthGuidePage />
        ) : (
          <ActivitiesPage key={user?.id ?? "anonymous"} />
        )}
      </div>
    </>
  );
}
