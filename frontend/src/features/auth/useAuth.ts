import { useSyncExternalStore } from "react";
import { getSession, subscribeSession } from "@source/features/auth/session";

export function useAuth() {
  return useSyncExternalStore(subscribeSession, getSession);
}
