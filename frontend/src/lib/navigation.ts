import { useSyncExternalStore } from "react";

export const pageHashes = {
  activities: "#actividades",
  "auth-guide": "#guia-autenticacion",
} as const;

export function getPageForHash(hash: string) {
  return hash === pageHashes["auth-guide"] ? "auth-guide" : "activities";
}

function subscribeNavigation(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function useCurrentPage() {
  return useSyncExternalStore(
    subscribeNavigation,
    () => getPageForHash(window.location.hash),
    () => getPageForHash(""),
  );
}
