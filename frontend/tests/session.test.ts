import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = {
  id: 1,
  username: "juan",
  is_staff: false,
  participant: { id: "p1", name: "Juan" },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("document", { cookie: "csrftoken=csrf-demo" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sesión en memoria", () => {
  it("restaura la sesión compartiendo una sola renovación", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("csrf") ? json({}) : json({ access: "access", user }),
    );
    vi.stubGlobal("fetch", fetch);
    const session = await import("../src/features/auth/session");
    const [a, b] = await Promise.all([
      session.refreshSession(),
      session.refreshSession(),
    ]);
    expect(a && b).toBe(true);
    expect(
      fetch.mock.calls.filter(([url]) => url.includes("refresh")),
    ).toHaveLength(1);
    expect(session.getSession().user?.username).toBe("juan");
    expect(session.getSession().access).toBe("access");
  });

  it("no restaura una sesión con una renovación tardía después del logout", async () => {
    let complete!: (response: Response) => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("refresh")) {
          started();
          return new Promise<Response>((resolve) => {
            complete = resolve;
          });
        }
        return Promise.resolve(
          url.includes("logout")
            ? new Response(null, { status: 204 })
            : json({}),
        );
      }),
    );
    const session = await import("../src/features/auth/session");
    const refresh = session.refreshSession();
    await pending;
    await session.logout();
    complete(json({ access: "late", user }));
    expect(await refresh).toBe(false);
    expect(session.getSession().status).toBe("anonymous");
    expect(session.getSession().access).toBeNull();
  });

  it("informa cuando no puede confirmar el logout remoto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const session = await import("../src/features/auth/session");
    expect(await session.logout()).toBe(false);
    expect(session.getSession().status).toBe("anonymous");
    expect(session.getSession().message).toContain("no se pudo confirmar");
  });

  it("limpia la sesión si el refresh falla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("csrf")
          ? json({})
          : json({ code: "refresh_invalid" }, 401),
      ),
    );
    const session = await import("../src/features/auth/session");
    expect(await session.refreshSession()).toBe(false);
    expect(session.getSession().access).toBeNull();
  });
});

describe("cliente HTTP", () => {
  async function authenticatedClient(
    handler: (url: string, init?: RequestInit) => Promise<Response>,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes("csrf")) return json({});
        if (url.includes("login")) return json({ access: "old", user });
        return handler(url, init);
      }),
    );
    const session = await import("../src/features/auth/session");
    await session.login("juan", "password");
    const { request } = await import("../src/lib/http");
    return { session, request };
  }

  it("renueva una sola vez ante varios 401 y reenvía Bearer", async () => {
    let refreshes = 0;
    const { request } = await authenticatedClient(async (url, init) => {
      if (url.includes("refresh")) {
        refreshes++;
        return json({ access: "new", user });
      }
      return new Headers(init?.headers).get("Authorization") === "Bearer new"
        ? json({ ok: true })
        : json({}, 401);
    });
    const responses = await Promise.all([
      request("/api/private/a", {}, true),
      request("/api/private/b", {}, true),
    ]);
    expect(responses).toEqual([{ ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
  });

  it("no reintenta errores de negocio y maneja 204 sin JSON", async () => {
    const calls: string[] = [];
    const { request } = await authenticatedClient(async (url) => {
      calls.push(url);
      return url.endsWith("cancel")
        ? new Response(null, { status: 204 })
        : json({ code: "capacity_exhausted", message: "Sin cupo" }, 409);
    });
    await expect(request("/api/full", {}, true)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await request("/api/cancel", { method: "DELETE" }, true),
    ).toBeUndefined();
    expect(calls).toEqual(["/api/full", "/api/cancel"]);
  });

  it("no entra en bucle cuando el reintento también responde 401", async () => {
    let requests = 0;
    const { request, session } = await authenticatedClient(async (url) => {
      if (url.includes("refresh")) return json({ access: "new", user });
      requests++;
      return json({}, 401);
    });
    await expect(request("/api/private", {}, true)).rejects.toMatchObject({
      status: 401,
    });
    expect(requests).toBe(2);
    expect(session.getSession().status).toBe("anonymous");
  });

  it("no inicia refresh si el 401 llega después del logout", async () => {
    let complete!: (response: Response) => void;
    let refreshes = 0;
    const { request, session } = await authenticatedClient(async (url) => {
      if (url.includes("refresh")) {
        refreshes++;
        return json({ access: "new", user });
      }
      if (url.includes("logout")) return new Response(null, { status: 204 });
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    });
    const pending = request("/api/private", {}, true);
    await session.logout();
    complete(json({}, 401));
    await expect(pending).rejects.toMatchObject({ code: "session_changed" });
    expect(refreshes).toBe(0);
  });
});
