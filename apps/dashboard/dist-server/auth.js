import { timingSafeEqual } from "node:crypto";
function safeEqual(a, b) {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    return ba.length === bb.length && timingSafeEqual(ba, bb);
}
export async function registerAuth(app, opts) {
    // login dibatasi ketat (anti brute force)
    app.post("/api/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
        const body = (req.body ?? {});
        const username = typeof body.username === "string" ? body.username : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (username !== opts.user || !safeEqual(password, opts.password)) {
            return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "username atau password salah" } });
        }
        const token = app.jwt.sign({ sub: username }, { expiresIn: "12h" });
        reply.setCookie("pm2dash", token, { path: "/", httpOnly: true, sameSite: "strict", maxAge: 12 * 60 * 60 });
        return { ok: true };
    });
    app.post("/api/auth/logout", async (_req, reply) => {
        reply.clearCookie("pm2dash", { path: "/" });
        return { ok: true };
    });
    app.get("/api/auth/me", async (req) => {
        const payload = req.user;
        return { username: payload?.sub ?? null };
    });
}
//# sourceMappingURL=auth.js.map