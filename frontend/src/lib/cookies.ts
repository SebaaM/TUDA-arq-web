export function readCsrfCookie(cookie: string): string | null {
  const entry = cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("csrftoken="));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice("csrftoken=".length)) || null;
  } catch {
    return null;
  }
}
