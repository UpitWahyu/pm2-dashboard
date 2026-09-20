import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LogQuerySchema } from "@pm2-dashboard/shared";
import {
  AgentError,
  getProcessDetail,
  getProcessLogs,
  getProcesses,
  getServerSummary,
  runProcessAction,
  type AgentAction,
  type ServerConfig,
} from "./agents.js";
import { serverStore } from "./serverStore.js";
import * as db from "./database.js";
import { parseEnvServers, serverRowToConfig } from "./config.js";

const ACTIONS: AgentAction[] = ["restart", "stop", "start", "delete"];

// ---- schemas validasi input ----
const ServerInputSchema = z.object({
  name: z.string().min(1).max(64),
  url: z.string().url().or(z.string().regex(/^https?:\/\/.+/)),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  token: z.string().min(16),
});
const ServerPatchSchema = ServerInputSchema.partial().extend({
  enabled: z.boolean().optional(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const findServer = (name: string): ServerConfig => {
    const cfg = serverStore.findByName(name);
    if (!cfg || !cfg.enabled) throw new AgentError(404, `server '${name}' tidak dikenal`);
    return cfg;
  };

  // ---------- Server management (CRUD) ----------

  app.get("/api/servers/list", async () => {
    // semua server (termasuk disabled) untuk halaman manage
    const rows = await db.listServers();
    return { servers: rows.map((r) => serverRowToConfig(r)) };
  });

  app.get("/api/servers/sync/status", async () => {
    let dbOk = false;
    let envCount = 0;
    let dbCount = 0;
    try {
      dbOk = await db.dbAvailable();
      if (dbOk) dbCount = (await db.listServers()).length;
    } catch {
      dbOk = false;
    }
    envCount = parseEnvServers().length;
    return { dbAvailable: dbOk, envServers: envCount, dbServers: dbCount };
  });

  // Export backup JSON (seluruh secrets + servers)
  app.get("/api/servers/backup", async (_req, reply) => {
    if (!(await db.dbAvailable())) {
      return reply.code(503).send({ error: { code: "DB_UNAVAILABLE", message: "database tidak tersedia" } });
    }
    const dump = await db.dumpData();
    reply.header("content-disposition", `attachment; filename="pm2dash-backup-${Date.now()}.json"`);
    reply.header("content-type", "application/json");
    return dump;
  });

  app.post("/api/servers", async (req, reply) => {
    const parsed = ServerInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
    }
    const dup = await db.getServerByName(parsed.data.name);
    if (dup) {
      return reply.code(409).send({ error: { code: "CONFLICT", message: `server '${parsed.data.name}' sudah ada` } });
    }
    const { row, created } = await db.upsertServer({
      name: parsed.data.name,
      url: parsed.data.url,
      port: parsed.data.port ?? null,
      token: parsed.data.token,
    });
    await serverStore.refreshFromDb();
    return reply.code(created ? 201 : 200).send({ server: serverRowToConfig(row) });
  });

  app.put("/api/servers/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "id tidak valid" } });
    }
    const parsed = ServerPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: parsed.error.message } });
    }
    const updated = await db.updateServer(id, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "server tidak ditemukan" } });
    }
    await serverStore.refreshFromDb();
    return { server: serverRowToConfig(updated) };
  });

  app.delete("/api/servers/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: "id tidak valid" } });
    }
    const ok = await db.deleteServer(id);
    if (!ok) {
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "server tidak ditemukan" } });
    }
    await serverStore.refreshFromDb();
    return { ok: true };
  });

  // Sync .env → DB (migration + upsert). Idempoten.
  app.post("/api/servers/sync", async (_req, reply) => {
    if (!(await db.dbAvailable())) {
      return reply.code(503).send({ error: { code: "DB_UNAVAILABLE", message: "database tidak tersedia" } });
    }
    const envServers = parseEnvServers().filter((s) => s.name && s.token.length >= 16);
    const upserted: string[] = [];
    for (const s of envServers) {
      await db.upsertServer({ name: s.name, url: s.url, port: s.port, token: s.token });
      upserted.push(s.name);
    }
    // sinkronkan juga secret penting dari .env ke DB (hanya kalau belum ada)
    const existing = await db.getSecrets(["SESSION_SECRET", "DASHBOARD_PASSWORD", "DASHBOARD_USER", "REFRESH_SECRET"]);
    const secretEntries: Array<{ key: string; value: string; description?: string }> = [];
    if (!existing["SESSION_SECRET"] && process.env["SESSION_SECRET"]) {
      secretEntries.push({ key: "SESSION_SECRET", value: process.env["SESSION_SECRET"]!, description: "Session JWT secret" });
    }
    if (!existing["REFRESH_SECRET"] && process.env["REFRESH_SECRET"]) {
      secretEntries.push({ key: "REFRESH_SECRET", value: process.env["REFRESH_SECRET"]!, description: "Refresh JWT secret" });
    }
    if (!existing["DASHBOARD_PASSWORD"] && process.env["DASHBOARD_PASSWORD"]) {
      secretEntries.push({ key: "DASHBOARD_PASSWORD", value: process.env["DASHBOARD_PASSWORD"]!, description: "Password login dashboard" });
    }
    if (!existing["DASHBOARD_USER"] && process.env["DASHBOARD_USER"]) {
      secretEntries.push({ key: "DASHBOARD_USER", value: process.env["DASHBOARD_USER"]!, description: "Username login dashboard" });
    }
    if (secretEntries.length) await db.setSecrets(secretEntries);
    await serverStore.refreshFromDb();
    return { ok: true, syncedServers: upserted, syncedSecrets: secretEntries.map((e) => e.key) };
  });

  // ---------- Proxy ke agent (baca dari store, hot-reload) ----------

  app.get("/api/servers", async () => {
    const list = await Promise.all(serverStore.getEnabledServers().map(getServerSummary));
    return { servers: list };
  });

  app.get("/api/servers/:name/processes", async (req) => {
    const { name } = req.params as { name: string };
    const processes = await getProcesses(findServer(name));
    return { processes };
  });

  app.get("/api/servers/:name/processes/:id", async (req) => {
    const { name, id } = req.params as { name: string; id: string };
    return getProcessDetail(findServer(name), id);
  });

  for (const action of ACTIONS) {
    app.post(`/api/servers/:name/processes/:id/${action}`, async (req) => {
      const { name, id } = req.params as { name: string; id: string };
      const process = await runProcessAction(findServer(name), id, action);
      return { ok: true, action, process };
    });
  }

  app.get("/api/servers/:name/processes/:id/logs", async (req) => {
    const { name, id } = req.params as { name: string; id: string };
    const query = LogQuerySchema.parse(req.query);
    return getProcessLogs(findServer(name), id, query.lines, query.stream);
  });
}
