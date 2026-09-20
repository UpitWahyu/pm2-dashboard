import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as db from "./database.js";

export interface AuthOptions {
  user: string;
  password: string;
  /** Secret terpisah untuk refresh token. */
  refreshSecret: string;
  /** TTL access token dalam menit (default 15). */
  accessTokenTtlMinutes: number;
  /** TTL refresh token dalam hari (default 7). */
  refreshTokenTtlDays: number;
  /** Set flag `secure` pada cookie (butuh HTTPS). */
  cookieSecure: boolean;
}

const ACCESS_COOKIE = "pm2dash";
const REFRESH_COOKIE = "pm2dash_refresh";
const REFRESH_COOKIE_PATH = "/api/auth";

let statelessWarned = false;

/** Print warning stateless cukup sekali per proses. */
function warnStateless(): void {
  if (statelessWarned) return;
  statelessWarned = true;
  console.warn("[auth] database tidak tersedia — refresh token diverifikasi stateless (tanpa rotasi tersimpan)");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

interface RefreshPayload {
  sub?: string;
  typ?: string;
}

export async function registerAuth(app: FastifyInstance, opts: AuthOptions): Promise<void> {
  const accessTtlSec = opts.accessTokenTtlMinutes * 60;
  const refreshTtlSec = opts.refreshTokenTtlDays * 24 * 60 * 60;
  const cookieBase = { httpOnly: true, sameSite: "strict" as const, secure: opts.cookieSecure };

  function clearAuthCookies(reply: FastifyReply): void {
    reply.clearCookie(ACCESS_COOKIE, { path: "/" });
    reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  /**
   * Terbitkan access + refresh token baru, set kedua cookie, dan — kalau DB
   * tersedia — simpan hash refresh token untuk rotasi. Tanpa DB, token tetap
   * valid secara stateless.
   */
  async function issueTokens(reply: FastifyReply, username: string): Promise<void> {
    const accessToken = app.jwt.sign(
      { sub: username, typ: "access", jti: randomUUID() },
      { expiresIn: `${opts.accessTokenTtlMinutes}m` },
    );
    const refreshToken = app.jwt.sign(
      { sub: username, typ: "refresh", jti: randomUUID() },
      { key: opts.refreshSecret, expiresIn: `${opts.refreshTokenTtlDays}d` },
    );

    reply.setCookie(ACCESS_COOKIE, accessToken, { ...cookieBase, path: "/", maxAge: accessTtlSec });
    reply.setCookie(REFRESH_COOKIE, refreshToken, { ...cookieBase, path: REFRESH_COOKIE_PATH, maxAge: refreshTtlSec });

    let dbOk = false;
    try {
      dbOk = await db.dbAvailable();
    } catch {
      dbOk = false;
    }
    if (!dbOk) {
      warnStateless();
      return;
    }
    try {
      const expiresAt = new Date(Date.now() + refreshTtlSec * 1000);
      await db.insertRefreshToken(hashToken(refreshToken), username, expiresAt);
    } catch (err) {
      // Jangan gagalkan login/refresh hanya karena penulisan token gagal.
      console.warn(`[auth] gagal menyimpan refresh token: ${(err as Error).message}`);
    }
  }

  // login dibatasi ketat (anti brute force)
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
      const username = typeof body.username === "string" ? body.username : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (username !== opts.user || !safeEqual(password, opts.password)) {
        return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "username atau password salah" } });
      }
      await issueTokens(reply, username);
      return { ok: true };
    },
  );

  // Rotasi refresh token: token lama di-revoke, token baru diterbitkan.
  app.post(
    "/api/auth/refresh",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const unauthorized = () =>
        reply
          .code(401)
          .send({ error: { code: "UNAUTHORIZED", message: "refresh token tidak valid" } });

      const token = req.cookies[REFRESH_COOKIE];
      if (!token) {
        clearAuthCookies(reply);
        return unauthorized();
      }

      let payload: RefreshPayload | null = null;
      try {
        payload = app.jwt.verify<RefreshPayload>(token, { key: opts.refreshSecret });
      } catch {
        payload = null;
      }
      const username = payload?.sub;
      if (!payload || payload.typ !== "refresh" || typeof username !== "string" || username.length === 0) {
        clearAuthCookies(reply);
        return unauthorized();
      }

      let dbOk = false;
      try {
        dbOk = await db.dbAvailable();
      } catch {
        dbOk = false;
      }

      if (dbOk) {
        let row: db.RefreshTokenRow | null = null;
        try {
          row = await db.findRefreshToken(hashToken(token));
        } catch (err) {
          // DB terhubung tapi query gagal (mis. schema belum siap) → stateless.
          req.log.warn(`[auth] gagal membaca refresh token dari DB, fallback stateless: ${(err as Error).message}`);
          warnStateless();
          await issueTokens(reply, username);
          return { ok: true };
        }
        if (!row || row.revoked_at || row.expires_at.getTime() <= Date.now()) {
          clearAuthCookies(reply);
          return unauthorized();
        }
        try {
          await db.touchRefreshToken(hashToken(token));
          await db.revokeRefreshToken(hashToken(token));
        } catch (err) {
          req.log.warn(`[auth] gagal revoke refresh token lama: ${(err as Error).message}`);
        }
      } else {
        warnStateless();
      }

      await issueTokens(reply, username);
      return { ok: true };
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (token) {
      try {
        if (await db.dbAvailable()) await db.revokeRefreshToken(hashToken(token));
      } catch (err) {
        req.log.warn(`[auth] gagal revoke refresh token: ${(err as Error).message}`);
      }
    }
    clearAuthCookies(reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => {
    const payload = req.user as { sub?: string } | undefined;
    return { username: payload?.sub ?? null };
  });
}
