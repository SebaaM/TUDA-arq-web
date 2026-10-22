// Decoding is for display only; Django remains responsible for signature validation.
export function getAccessTiming(token: string | null) {
  if (!token) return null;
  try {
    const segments = token.split(".");
    if (segments.length !== 3) return null;
    const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    const payload: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(decoded, (char) => char.charCodeAt(0)),
      ),
    );
    if (!payload || typeof payload !== "object") return null;
    const claims = payload as Record<string, unknown>;
    if (
      typeof claims.exp !== "number" ||
      !Number.isFinite(new Date(claims.exp * 1000).getTime())
    )
      return null;
    return {
      expiresAt: claims.exp * 1000,
      issuedAt:
        typeof claims.iat === "number" &&
        Number.isFinite(new Date(claims.iat * 1000).getTime())
          ? claims.iat * 1000
          : null,
    };
  } catch {
    return null;
  }
}

export function formatRemaining(expiresAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
