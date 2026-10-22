import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccessTiming,
  formatRemaining,
} from "../src/features/session-inspector/tokens";
import { readCsrfCookie } from "../src/lib/cookies";

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("metadatos de credenciales", () => {
  const jwt = (claims: unknown) =>
    `header.${btoa(JSON.stringify(claims)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}.signature`;
  it("lee exp e iat sin atribuir validez a la firma", () => {
    expect(getAccessTiming(jwt({ exp: 1700000300, iat: 1700000000 }))).toEqual({
      expiresAt: 1700000300000,
      issuedAt: 1700000000000,
    });
    expect(formatRemaining(1700000300000, 1700000000000)).toBe("05:00");
    expect(formatRemaining(1700000300000, 1700000301000)).toBe("00:00");
  });
  it("tolera JWT ausentes, incompletos o con claims inválidos", () => {
    for (const token of [
      null,
      "",
      "invalid",
      "a.***.c",
      jwt({ exp: "tomorrow" }),
      jwt({ exp: 1e300 }),
    ]) {
      expect(getAccessTiming(token)).toBeNull();
    }
  });
  it("solo observa CSRF: no supone que puede leer HttpOnly ni sus atributos", () => {
    expect(readCsrfCookie("other=value;csrftoken=csrf%2Ddemo")).toBe(
      "csrf-demo",
    );
    expect(readCsrfCookie("other=value")).toBeNull();
    expect(readCsrfCookie("csrftoken=%E0%A4%A")).toBeNull();
  });
});

describe("observación de HTTP", () => {
  it("registra señales sin filtrar tokens, contraseñas, cookies o parámetros", async () => {
    const result = new Response(JSON.stringify({ access: "response-secret" }));
    const fetch = vi.fn().mockResolvedValue(result);
    vi.stubGlobal("fetch", fetch);
    const { observedFetch } = await import("../src/lib/observedFetch");
    const { getDiagnostics } = await import("../src/lib/sessionDiagnostics");
    expect(
      await observedFetch("/api/auth/login/?secret=query-secret", {
        method: "POST",
        headers: {
          Authorization: "Bearer access-secret",
          "X-CSRFToken": "csrf-secret",
          Cookie: "refresh_token=refresh-secret",
        },
        body: JSON.stringify({ password: "password-secret" }),
      }),
    ).toBe(result);
    const event = getDiagnostics().events[0];
    expect(event.exchange).toMatchObject({
      path: "/api/auth/login/",
      bearer: true,
      csrf: true,
      refreshEligible: true,
      httpStatus: 200,
    });
    const serialized = JSON.stringify(getDiagnostics());
    for (const secret of [
      "access-secret",
      "csrf-secret",
      "refresh-secret",
      "password-secret",
      "query-secret",
      "response-secret",
    ])
      expect(serialized).not.toContain(secret);
    expect(result.bodyUsed).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("conserva intercambios pendientes al limpiar y muestra errores de red", async () => {
    let reject!: (error: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_, fail) => {
            reject = fail;
          }),
      ),
    );
    const { observedFetch } = await import("../src/lib/observedFetch");
    const { getDiagnostics, clearDiagnosticHistory } =
      await import("../src/lib/sessionDiagnostics");
    const promise = observedFetch("/api/v2/me/enrollments/");
    expect(getDiagnostics().pending).toBe(1);
    clearDiagnosticHistory();
    expect(getDiagnostics().events).toHaveLength(1);
    reject(new TypeError("offline"));
    await expect(promise).rejects.toThrow("offline");
    expect(getDiagnostics().pending).toBe(0);
    expect(getDiagnostics().events[0].phase).toBe("error");
  });
  it("limita el historial a 40 eventos y nunca marca una cookie como leída", async () => {
    const { noteDiagnostic, observeRefresh, getDiagnostics } =
      await import("../src/lib/sessionDiagnostics");
    for (let count = 0; count < 60; count++)
      noteDiagnostic("session", "Evento", "Metadatos");
    expect(getDiagnostics().events).toHaveLength(40);
    expect(getDiagnostics().refresh).toBe("unknown");
    observeRefresh("accepted");
    expect(getDiagnostics().refresh).toBe("accepted");
  });
});
