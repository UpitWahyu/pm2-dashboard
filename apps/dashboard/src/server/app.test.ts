import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";

const opts = {
  port: 4100,
  sessionSecret: "test-secret-1234567890",
  user: "admin",
  password: "rahasia123",
  servers: [{ name: "vps-1", url: "http://127.0.0.1:4001", token: "agent-token-1234567890" }],
};

const procOnline = {
  name: "app-a",
  pm_id: 0,
  status: "online",
  cpu: 1,
  memory: 1024,
  uptime: 0,
  restarts: 0,
  unstableRestarts: 0,
  outLogPath: null,
  errLogPath: null,
  createdAt: null,
  version: null,
};

type FetchMock = ReturnType<typeof vi.fn>;

function mockAgent(r: { status: number; body: unknown }): void {
  (fetch as unknown as FetchMock).mockResolvedValue({ status: r.status, json: async () => r.body });
}

function cookieHeader(header: string | string[] | undefined): string {
  return Array.isArray(header) ? header.join("; ") : (header ?? "");
}

function pickCookie(header: string | string[] | undefined, name: string): string {
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const found = list.find((c) => c.startsWith(`${name}=`));
  return found?.split(";")[0] ?? "";
}

async function loginCookie(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "admin", password: "rahasia123" },
  });
  return pickCookie(login.headers["set-cookie"], "pm2dash");
}

describe("dashboard API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("login salah → 401", async () => {
    const app = await buildApp(opts);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "salah" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("login benar → 200 + cookie pm2dash", async () => {
    const app = await buildApp(opts);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "rahasia123" },
    });
    expect(res.statusCode).toBe(200);
    const cookies = cookieHeader(res.headers["set-cookie"]);
    expect(cookies).toContain("pm2dash=");
    expect(cookies).toContain("pm2dash_refresh=");
  });

  it("login benar → refresh cookie terbatas path /api/auth", async () => {
    const app = await buildApp(opts);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "rahasia123" },
    });
    expect(cookieHeader(res.headers["set-cookie"])).toContain("Path=/api/auth");
  });

  it("refresh tanpa cookie → 401", async () => {
    const app = await buildApp(opts);
    const res = await app.inject({ method: "POST", url: "/api/auth/refresh" });
    expect(res.statusCode).toBe(401);
  });

  it("refresh token ngawur → 401", async () => {
    const app = await buildApp(opts);
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: "pm2dash_refresh=bukan-jwt" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("refresh token valid → 200 + cookie access & refresh baru", async () => {
    const app = await buildApp(opts);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "rahasia123" },
    });
    const refresh = pickCookie(login.headers["set-cookie"], "pm2dash_refresh");
    expect(refresh).not.toBe("");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      headers: { cookie: refresh },
    });
    expect(res.statusCode).toBe(200);
    const cookies = cookieHeader(res.headers["set-cookie"]);
    expect(cookies).toContain("pm2dash=");
    expect(cookies).toContain("pm2dash_refresh=");
  });

  it("refresh token unik antar login (rotasi tidak menabrak)", async () => {
    const app = await buildApp(opts);
    const login = () =>
      app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "admin", password: "rahasia123" },
      });
    const first = pickCookie((await login()).headers["set-cookie"], "pm2dash_refresh");
    const second = pickCookie((await login()).headers["set-cookie"], "pm2dash_refresh");
    expect(first).not.toBe("");
    expect(second).not.toBe("");
    expect(first).not.toBe(second);
  });

  it("logout → clear kedua cookie", async () => {
    const app = await buildApp(opts);
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "rahasia123" },
    });
    const cookies = [
      pickCookie(login.headers["set-cookie"], "pm2dash"),
      pickCookie(login.headers["set-cookie"], "pm2dash_refresh"),
    ].join("; ");
    const res = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: cookies } });
    expect(res.statusCode).toBe(200);
    expect(cookieHeader(res.headers["set-cookie"])).toContain("pm2dash_refresh=");
  });

  it("/api/servers tanpa cookie → 401", async () => {
    const app = await buildApp(opts);
    const res = await app.inject({ method: "GET", url: "/api/servers" });
    expect(res.statusCode).toBe(401);
  });

  it("/api/servers → ringkasan agent, fetch dgn bearer token", async () => {
    mockAgent({ status: 200, body: { processes: [procOnline] } });
    const app = await buildApp(opts);
    const cookie = await loginCookie(app);
    const res = await app.inject({ method: "GET", url: "/api/servers", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.servers).toHaveLength(1);
    expect(body.servers[0]).toMatchObject({ name: "vps-1", online: true, counts: { online: 1, total: 1 } });
    expect(fetch as unknown as FetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4001/api/processes",
      expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer agent-token-1234567890" }) }),
    );
  });

  it("agent offline → online:false + error", async () => {
    (fetch as unknown as FetchMock).mockRejectedValue(new Error("ECONNREFUSED"));
    const app = await buildApp(opts);
    const cookie = await loginCookie(app);
    const res = await app.inject({ method: "GET", url: "/api/servers", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().servers[0]).toMatchObject({ online: false });
  });

  it("server tidak dikenal → 404", async () => {
    mockAgent({ status: 200, body: { processes: [] } });
    const app = await buildApp(opts);
    const cookie = await loginCookie(app);
    const res = await app.inject({ method: "GET", url: "/api/servers/nope/processes", headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });

  it("aksi restart diteruskan ke agent", async () => {
    mockAgent({ status: 200, body: { ok: true, action: "restart", process: procOnline } });
    const app = await buildApp(opts);
    const cookie = await loginCookie(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/servers/vps-1/processes/0/restart",
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, action: "restart", process: { name: "app-a" } });
    expect(fetch as unknown as FetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4001/api/processes/0/restart",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
