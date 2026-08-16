import websocket from "@fastify/websocket";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { extractBearer, isValidToken } from "./auth.js";
import { registerLiveWs, type LiveHub } from "./live.js";
import { registerRoutes } from "./routes.js";

export interface BuildAppOptions {
  token: string;
  name: string;
  version: string;
  hub: LiveHub;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(websocket);

  // POST JSON kosong → {} (hindari FST_ERR_CTP_EMPTY_JSON_BODY)
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, body === "" ? {} : JSON.parse(String(body)));
    } catch (err) {
      done(err as Error);
    }
  });

  // Auth global: semua /api/* (kecuali health & WS live yang pakai first-message auth)
  app.addHook("onRequest", async (req, reply) => {
    const url = (req.url.split("?")[0] ?? "").replace(/\/+$/, "");
    if (url === "/health" || url === "/api/live") return;
    if (url.startsWith("/api/")) {
      const provided = extractBearer(req.headers.authorization);
      if (!isValidToken(provided, opts.token)) {
        await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "token tidak valid" } });
      }
    }
  });

  app.setErrorHandler((err, req, reply) => {
    const e = err as FastifyError;
    if (e.name === "ZodError" || e.validation) {
      return reply.code(400).send({ error: { code: "BAD_REQUEST", message: e.message } });
    }
    req.log.error(err);
    return reply.code(500).send({ error: { code: "INTERNAL", message: "internal error" } });
  });

  await registerRoutes(app, { name: opts.name, version: opts.version });
  registerLiveWs(app, opts.hub, opts.token);

  return app;
}
