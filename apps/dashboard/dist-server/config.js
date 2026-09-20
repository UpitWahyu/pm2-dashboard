import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import * as db from "./database.js";
// .env dicari di beberapa lokasi agar tahan terhadap cwd & src/dist (sama seperti agent)
const here = import.meta.dirname;
for (const candidate of [resolve(here, ".env"), resolve(here, "../.env"), resolve(here, "../../../.env")]) {
    loadEnv({ path: candidate });
}
function required(name, minLen) {
    const value = process.env[name] ?? "";
    if (value.length < minLen)
        return null;
    return value;
}
function optional(name) {
    const value = process.env[name] ?? "";
    return value.length > 0 ? value : null;
}
/** Env integer positif; fallback ke default kalau kosong/tidak valid. */
function positiveInt(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0)
        return Math.floor(n);
    console.warn(`[config] ${name} tidak valid — memakai default ${fallback}`);
    return fallback;
}
/**
 * Pilih secret refresh: minimal 32 karakter. Kalau kosong/terlalu pendek,
 * fallback ke SESSION_SECRET sambil mencetak warning.
 */
function pickRefreshSecret(candidate, sessionSecret) {
    if (!candidate) {
        console.warn("[config] REFRESH_SECRET tidak diset — memakai SESSION_SECRET");
        return sessionSecret;
    }
    if (candidate.length < 32) {
        console.warn("[config] REFRESH_SECRET kurang dari 32 karakter — memakai SESSION_SECRET");
        return sessionSecret;
    }
    return candidate;
}
function serverRowToConfig(r) {
    return {
        id: r.id,
        name: r.name,
        url: r.url.replace(/\/+$/, ""),
        port: r.port,
        token: r.token,
        enabled: r.enabled,
    };
}
/** Parse DASHBOARD_SERVERS dari .env (fallback jika DB kosong/tidak tersedia). */
function parseEnvServers() {
    const raw = process.env["DASHBOARD_SERVERS"];
    if (!raw)
        return [];
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr))
            return [];
        return arr.map((s) => {
            const item = s;
            return {
                id: -1,
                name: item.name ?? "",
                url: (item.url ?? "").replace(/\/+$/, ""),
                port: item.port ?? null,
                token: item.token ?? "",
                enabled: true,
            };
        });
    }
    catch {
        return [];
    }
}
/**
 * Muat config. Secret (SESSION_SECRET, DASHBOARD_PASSWORD) dibaca dari DB dulu,
 * fallback ke .env. Daftar server dibaca dari DB (hanya yang enabled) dan
 * digabung dengan server dari .env yang belum ada di DB (agar .env tetap jadi
 * fallback saat DB down).
 */
export async function loadConfig() {
    const port = Number(process.env["PORT"] ?? 4100);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error("[config] PORT tidak valid");
    }
    const sessionSecret = required("SESSION_SECRET", 16);
    const user = optional("DASHBOARD_USER") ?? "admin";
    const password = required("DASHBOARD_PASSWORD", 6);
    if (!sessionSecret) {
        throw new Error("[config] SESSION_SECRET wajib diisi (min 16 karakter) — cek apps/dashboard/.env");
    }
    if (!password) {
        throw new Error("[config] DASHBOARD_PASSWORD wajib diisi (min 6 karakter) — cek apps/dashboard/.env");
    }
    return {
        port,
        host: process.env["HOST"] ?? "127.0.0.1",
        sessionSecret,
        refreshSecret: optional("REFRESH_SECRET") ?? "",
        accessTokenTtlMinutes: positiveInt("ACCESS_TOKEN_TTL_MINUTES", 15),
        refreshTokenTtlDays: positiveInt("REFRESH_TOKEN_TTL_DAYS", 7),
        cookieSecure: (process.env["COOKIE_SECURE"] ?? "").toLowerCase() === "true",
        user,
        password,
        dbAvailable: false,
    };
}
/**
 * Ambil secret dari DB, fallback ke .env jika DB tidak tersedia.
 * Mengembalikan secret final + flag dbAvailable.
 */
export async function resolveSecrets(base) {
    if (await db.dbAvailable()) {
        try {
            const rows = await db.getSecrets(["SESSION_SECRET", "DASHBOARD_PASSWORD", "DASHBOARD_USER", "REFRESH_SECRET"]);
            const sessionSecret = rows["SESSION_SECRET"] ?? base.sessionSecret;
            const refreshSecret = pickRefreshSecret(rows["REFRESH_SECRET"] ?? base.refreshSecret, sessionSecret);
            const password = rows["DASHBOARD_PASSWORD"] ?? base.password;
            const user = rows["DASHBOARD_USER"] ?? base.user;
            return { sessionSecret, refreshSecret, password, user, dbAvailable: true };
        }
        catch (err) {
            console.error(`[config] gagal baca secret dari DB, pakai .env: ${err.message}`);
        }
    }
    return {
        sessionSecret: base.sessionSecret,
        refreshSecret: pickRefreshSecret(base.refreshSecret, base.sessionSecret),
        password: base.password,
        user: base.user,
        dbAvailable: false,
    };
}
/** Baca daftar server aktif dari DB; jika DB down, pakai .env. */
export async function loadActiveServers() {
    if (await db.dbAvailable()) {
        try {
            const rows = await db.listServers(true);
            if (rows.length > 0) {
                return { servers: rows.map(serverRowToConfig), dbAvailable: true };
            }
        }
        catch (err) {
            console.error(`[config] gagal baca server dari DB, pakai .env: ${err.message}`);
        }
    }
    // Fallback: .env (filter nama kosong/token kosong)
    const envServers = parseEnvServers().filter((s) => s.name && s.token.length >= 16);
    return { servers: envServers, dbAvailable: false };
}
export { serverRowToConfig, parseEnvServers };
//# sourceMappingURL=config.js.map