import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, {} from "fastify";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AgentError } from "./agents.js";
import { registerAuth } from "./auth.js";
import { registerLiveWs } from "./live.js";
import { registerRoutes } from "./routes.js";
import { serverStore } from "./serverStore.js";
export async function buildApp(opts) {
    const app = Fastify({ logger: true });
    await app.register(cookie);
    await app.register(jwt, { secret: opts.sessionSecret, cookie: { cookieName: "pm2dash", signed: false } });
    await app.register(websocket);
    await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
    // POST JSON kosong → {} (hindari FST_ERR_CTP_EMPTY_JSON_BODY)
    app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
        try {
            done(null, body === "" ? {} : JSON.parse(String(body)));
        }
        catch (err) {
            done(err);
        }
    });
    // Auth: semua /api/* & /ws/* (kecuali login) — JWT dari cookie pm2dash
    app.addHook("onRequest", async (req, reply) => {
        const url = (req.url.split("?")[0] ?? "").replace(/\/+$/, "");
        if (url === "/api/auth/login")
            return;
        if (url.startsWith("/api/") || url.startsWith("/ws/")) {
            try {
                await req.jwtVerify();
            }
            catch {
                return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "silahkan login" } });
            }
        }
    });
    app.setErrorHandler((err, req, reply) => {
        const e = err;
        if (e.name === "ZodError" || e.validation) {
            return reply.code(400).send({ error: { code: "BAD_REQUEST", message: e.message } });
        }
        if (err instanceof AgentError) {
            return reply.code(err.status).send({ error: { code: "AGENT_ERROR", message: err.message } });
        }
        req.log.error(err);
        return reply.code(500).send({ error: { code: "INTERNAL", message: "internal error" } });
    });
    await registerAuth(app, { user: opts.user, password: opts.password });
    await registerRoutes(app);
    registerLiveWs(app);
    // Static web (kalau sudah di-build) + SPA fallback
    const here = import.meta.dirname;
    const webRoot = [resolve(here, "../dist"), resolve(here, "../../dist")].find((p) => existsSync(resolve(p, "index.html")));
    if (webRoot) {
        await app.register(fastifyStatic, { root: webRoot, wildcard: false });
        app.setNotFoundHandler((req, reply) => {
            if (req.url.startsWith("/api/") || req.url.startsWith("/ws/")) {
                return reply.code(404).send({ error: { code: "NOT_FOUND", message: "not found" } });
            }
            return reply.sendFile("index.html");
        });
    }
    return app;
}
//# sourceMappingURL=app.js.map