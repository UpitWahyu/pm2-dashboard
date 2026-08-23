import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { LiveHub } from "./live.js";
import { tailFile } from "./pm2.js";

const TOKEN = "test-token-1234567890";

const pm2Mock = vi.hoisted(() => ({
  connect: vi.fn((cb: (e: Error | null) => void) => cb(null)),
  list: vi.fn(),
  describe: vi.fn(),
  restart: vi.fn(),
  stop: vi.fn(),
  start: vi.fn(),
  delete: vi.fn(),
  connectBus: vi.fn((cb: (e: Error | null, bus: { on: () => void }) => void) => cb(null, { on: () => undefined })),
  disconnect: vi.fn(),
}));

vi.mock("pm2", () => ({ default: pm2Mock }));

const procOnline = {
  name: "app-a",
  pm_id: 0,
  cpu: 1.5,
  pid: 4242,
  monit: { memory: 10485760 },
  pm2_env: {
    status: "online",
    pm_uptime: 5000,
    restart_time: 2,
    unstable_restarts: 0,
    pm_out_log_path: "/tmp/app-a.out.log",
    pm_err_log_path: "/tmp/app-a.err.log",
    created_at: 1700000000000,
    version: "1.2.3",
    script: "/srv/app-a/index.js",
    exec_interpreter: "node",
    node_version: "24.0.0",
    pm2_version: "7.0.3",
  },
};

async function makeApp() {
  return buildApp({ token: TOKEN, name: "test-agent", version: "0.1.0", hub: new LiveHub() });
}

describe("agent API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pm2Mock.list.mockImplementation((cb: (e: Error | null, list: unknown[]) => void) => cb(null, [procOnline]));
    pm2Mock.describe.mockImplementation((_id: unknown, cb: (e: Error | null, list: unknown[]) => void) => cb(null, [procOnline]));
    pm2Mock.restart.mockImplementation((_id: unknown, cb: (e: Error | null, proc: unknown) => void) => cb(null, procOnline));
    pm2Mock.stop.mockImplementation((_id: unknown, cb: (e: Error | null, proc: unknown) => void) => cb(null, procOnline));
    pm2Mock.start.mockImplementation((_id: unknown, cb: (e: Error | null, proc: unknown) => void) => cb(null, procOnline));
    pm2Mock.delete.mockImplementation((_id: unknown, cb: (e: Error | null, proc: unknown) => void) => cb(null, undefined));
  });

  it("health tanpa auth → 200", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, name: "test-agent", pm2Connected: true });
  });

  it("/api/processes tanpa token → 401", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/api/processes" });
    expect(res.statusCode).toBe(401);
  });

  it("/api/processes token salah → 401", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/processes",
      headers: { authorization: "Bearer token-salah" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("/api/processes token benar → 200 + list", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/processes",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.processes).toHaveLength(1);
    expect(body.processes[0]).toMatchObject({ name: "app-a", status: "online", pm_id: 0 });
    expect(typeof body.processes[0].memory).toBe("number");
  });

  it("POST restart → 200 + id diteruskan", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/processes/0/restart",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(pm2Mock.restart).toHaveBeenCalledWith(0, expect.any(Function));
    expect(res.json()).toMatchObject({ ok: true, action: "restart", process: { name: "app-a" } });
  });

  it("POST delete → process null", async () => {
    pm2Mock.describe.mockImplementation((_id: unknown, cb: (e: Error | null, list: unknown[]) => void) =>
      cb(null, []), // proses sudah hilang setelah delete
    );
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/processes/0/delete",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, action: "delete", process: null });
  });

  it("aksi utk proses yang tidak ada → 404", async () => {
    pm2Mock.restart.mockImplementation((_id: unknown, cb: (e: Error | null) => void) =>
      cb(new Error("process id not found")),
    );
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/processes/999/restart",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("logs?lines=2&stream=out → tail sesuai stream (tanpa merge)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pm2dash-"));
    const outPath = join(dir, "out.log");
    await writeFile(outPath, "2026-08-23T07:55:01: line1\n2026-08-23T07:55:02: line2\n2026-08-23T07:55:03: line3\n2026-08-23T07:55:04: line4\n2026-08-23T07:55:05: line5\n");
    pm2Mock.describe.mockImplementation((_id: unknown, cb: (e: Error | null, list: unknown[]) => void) =>
      cb(null, [{ ...procOnline, pm2_env: { ...procOnline.pm2_env, pm_out_log_path: outPath, pm_err_log_path: null } }]),
    );
    const app = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/processes/0/logs?lines=2&stream=out",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { stream: string; total: number; lines: { stream: string; line: string; timestamp: string }[] };
    expect(body.stream).toBe("out");
    expect(body.total).toBe(2);
    expect(body.lines.map((l) => l.line)).toEqual(["line4", "line5"]);
    await rm(dir, { recursive: true, force: true });
  });

  it("logs?stream=all → merge out+err berurutan by timestamp", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pm2dash-"));
    const outPath = join(dir, "out.log");
    const errPath = join(dir, "err.log");
    // out: dua event; err: satu event di antara keduanya
    await writeFile(
      outPath,
      "2026-08-23T07:55:04: out-first\n2026-08-23T07:55:06: out-second\n",
    );
    await writeFile(errPath, "2026-08-23T07:55:05: err-middle\n");
    pm2Mock.describe.mockImplementation((_id: unknown, cb: (e: Error | null, list: unknown[]) => void) =>
      cb(null, [{ ...procOnline, pm2_env: { ...procOnline.pm2_env, pm_out_log_path: outPath, pm_err_log_path: errPath } }]),
    );
    const app = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/processes/0/logs?lines=100&stream=all",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { stream: string; total: number; lines: { stream: string; line: string; timestamp: string }[] };
    expect(body.stream).toBe("all");
    expect(body.lines.map((l) => l.line)).toEqual(["out-first", "err-middle", "out-second"]);
    expect(body.lines.map((l) => l.stream)).toEqual(["out", "err", "out"]);
    expect(body.total).toBe(3);
    await rm(dir, { recursive: true, force: true });
  });

  it("logs param invalid → 400", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/processes/0/logs?lines=abc",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("tailFile", () => {
  it("ambil N baris terakhir; file tidak ada → ''", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pm2dash-tail-"));
    const p = join(dir, "x.log");
    await writeFile(p, "a\nb\nc\nd\ne\n");
    expect(await tailFile(p, 2)).toBe("d\ne");
    expect(await tailFile(join(dir, "missing.log"), 5)).toBe("");
    await rm(dir, { recursive: true, force: true });
  });
});
