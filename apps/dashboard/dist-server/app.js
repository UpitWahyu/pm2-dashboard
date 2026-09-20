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
// Endpoint auth yang tidak butuh access token valid.
const PUBLIC_AUTH_PATHS = new Set(["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]);
export async function buildApp(opts) {
    const app = Fastify({ logger: true });
    await app.register(cookie);
    await app.register(jwt, { secret: opts.sessionSecret, cookie: { cookieName: "pm2dash", signed: false } });
    await app.register(websocket);
    await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
    // Seed server store jika disediakan (test / bootstrap tanpa DB).
    if (opts.servers && opts.servers.length > 0) {
        serverStore.seed(opts.servers.map((s, i) => ({
            id: s.id ?? i + 1,
            name: s.name,
            url: s.url.replace(/\/+$/, ""),
            port: s.port ?? null,
            token: s.token,
            enabled: s.enabled ?? true,
        })));
    }
    // POST JSON kosong → {} (hindari FST_ERR_CTP_EMPTY_JSON_BODY)
    app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
        try {
            done(null, body === "" ? {} : JSON.parse(String(body)));
        }
        catch (err) {
            done(err);
        }
    });
    // Auth: semua /api/* & /ws/* (kecuali endpoint auth publik) — JWT dari cookie pm2dash
    app.addHook("onRequest", async (req, reply) => {
        const url = (req.url.split("?")[0] ?? "").replace(/\/+$/, "");
        if (PUBLIC_AUTH_PATHS.has(url))
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
    await registerAuth(app, {
        user: opts.user,
        password: opts.password,
        refreshSecret: opts.refreshSecret ?? opts.sessionSecret,
        accessTokenTtlMinutes: opts.accessTokenTtlMinutes ?? 15,
        refreshTokenTtlDays: opts.refreshTokenTtlDays ?? 7,
        cookieSecure: opts.cookieSecure ?? false,
    });
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