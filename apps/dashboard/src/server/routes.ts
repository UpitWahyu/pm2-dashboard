import type { FastifyInstance } from "fastify";
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

const ACTIONS: AgentAction[] = ["restart", "stop", "start", "delete"];

export async function registerRoutes(app: FastifyInstance, servers: ServerConfig[]): Promise<void> {
  const findServer = (name: string): ServerConfig => {
    const cfg = servers.find((s) => s.name === name);
    if (!cfg) throw new AgentError(404, `server '${name}' tidak dikenal`);
    return cfg;
  };

  app.get("/api/servers", async () => {
    const list = await Promise.all(servers.map(getServerSummary));
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
