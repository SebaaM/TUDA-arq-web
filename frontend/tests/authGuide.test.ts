import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthGuidePage } from "../src/features/auth-guide";
import { authFlows, credentialGuide } from "../src/features/auth-guide/content";
import { getPageForHash } from "../src/lib/navigation";

describe("guía de autenticación", () => {
  it("mantiene la guía pública separada de actividades", () => {
    expect(getPageForHash("#guia-autenticacion")).toBe("auth-guide");
    expect(getPageForHash("#actividades")).toBe("activities");
    expect(getPageForHash("")).toBe("activities");
    expect(getPageForHash("#desconocido")).toBe("activities");
  });

  it("distingue las tres credenciales y los tres recorridos", () => {
    expect(credentialGuide.map((credential) => credential.id)).toEqual([
      "access",
      "refresh",
      "csrf",
    ]);
    expect(authFlows.map((flow) => flow.id)).toEqual([
      "login",
      "refresh",
      "logout",
    ]);
    for (const flow of authFlows) {
      for (const step of flow.steps) {
        expect(["browser", "django", "database"]).toContain(step.from);
        expect(["browser", "django", "database"]).toContain(step.to);
        expect(step.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("prepara CSRF antes del login y limpia el access antes del logout", () => {
    const login = authFlows.find((flow) => flow.id === "login")!;
    expect(login.steps[0].label).toBe("GET /api/auth/csrf/");
    expect(
      login.steps.find((step) => step.label === "POST /api/auth/login/")
        ?.detail,
    ).toContain("CSRF");
    const logout = authFlows.find((flow) => flow.id === "logout")!;
    expect(logout.steps[0].label).toBe("Limpiar sesión local");
    expect(
      logout.steps.some((step) => step.label === "Invalidar ese refresh"),
    ).toBe(true);
  });

  it("ofrece diagramas con alternativa textual sin necesitar una sesión", () => {
    const html = renderToStaticMarkup(createElement(AuthGuidePage));
    expect(html).toContain("Autenticación y seguridad");
    expect(html.match(/<figure/g)).toHaveLength(3);
    expect(html.match(/<ol/g)).toHaveLength(3);
    expect(html.match(/role="link"/g)).toHaveLength(2);
    expect(html).toContain("#actividades");
    expect(html).toContain("JWT firmado no significa cifrado");
    expect(html).toContain("Guía explicativa, no actividad real");
  });
});
