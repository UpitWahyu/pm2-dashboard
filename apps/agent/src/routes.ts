import type { FastifyInstance } from "fastify";
import { LogQuerySchema } from "@pm2-dashboard/shared";
import {
  describeProcess,
  listProcesses,
  ProcessNotFoundError,
  runAction,
  tailLogs,
  type Pm2Action,
} from "./pm2.js";

export interface RouteContext {
  name: string;
  version: string;
}

function paramsId(req: { params: unknown }): string {
  return (req.params as { id?: string }).id ?? "";
}

function parseId(value: string): number | string {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : value;
}

function notFound(reply: { code: (c: number) => { send: (b: unknown) => unknown } }, message: string) {
  return reply.code(404).send({ error: { code: "NOT_FOUND", message } });
}

export async function registerRoutes(app: FastifyInstance, ctx: RouteContext): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    name: ctx.name,
    version: ctx.version,
    pm2Connected: true,
  }));

  app.get("/api/processes", async () => ({ processes: await listProcesses() }));

  app.get("/api/processes/:id", async (req, reply) => {
    const detail = await describeProcess(parseId(paramsId(req)));
    if (!detail) return notFound(reply, `process '${paramsId(req)}' tidak ditemukan`);
    return detail;
  });

  const actions: Array<[string, Pm2Action]> = [
    ["restart", "restart"],
    ["stop", "stop"],
    ["start", "start"],
    ["delete", "delete"],
  ];
  for (const [path, action] of actions) {
    // aksi mutasi dibatasi lebih ketat (anti spam restart/delete)
    app.post(
      `/api/processes/:id/${path}`,
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (req, reply) => {
        try {
          const process = await runAction(action, parseId(paramsId(req)));
          return { ok: true, action, process };
        } catch (err) {
          if (err instanceof ProcessNotFoundError) {
            return notFound(reply, err.message);
          }
          throw err;
        }
      },
    );
  }

  app.get("/api/processes/:id/logs", async (req, reply) => {
    const query = LogQuerySchema.parse(req.query);
    try {
      return await tailLogs(parseId(paramsId(req)), query.lines, query.stream);
    } catch (err) {
      if (err instanceof ProcessNotFoundError) {
        return notFound(reply, err.message);
      }
      throw err;
    }
  });
}
