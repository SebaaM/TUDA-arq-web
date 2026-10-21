import { ActivitiesPage } from "@source/features/activities";
import { useEffect } from "react";
import { refreshSession } from "@source/features/auth/session";
import { useAuth } from "@source/features/auth/useAuth";

export function App() {
  const { user } = useAuth();
  useEffect(() => {
    void refreshSession();
  }, []);
  return <ActivitiesPage key={user?.id ?? "anonymous"} />;
}
