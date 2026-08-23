import type { ServerRow } from "./database.js";
export interface ServerConfig {
    id: number;
    name: string;
    url: string;
    port: number | null;
    token: string;
    enabled: boolean;
}
export interface DashboardConfig {
    port: number;
    host: string;
    sessionSecret: string;
    user: string;
    password: string;
    dbAvailable: boolean;
}
declare function serverRowToConfig(r: ServerRow): ServerConfig;
/** Parse DASHBOARD_SERVERS dari .env (fallback jika DB kosong/tidak tersedia). */
declare function parseEnvServers(): ServerConfig[];
/**
 * Muat config. Secret (SESSION_SECRET, DASHBOARD_PASSWORD) dibaca dari DB dulu,
 * fallback ke .env. Daftar server dibaca dari DB (hanya yang enabled) dan
 * digabung dengan server dari .env yang belum ada di DB (agar .env tetap jadi
 * fallback saat DB down).
 */
export declare function loadConfig(): Promise<DashboardConfig>;
/**
 * Ambil secret dari DB, fallback ke .env jika DB tidak tersedia.
 * Mengembalikan secret final + flag dbAvailable.
 */
export declare function resolveSecrets(base: DashboardConfig): Promise<{
    sessionSecret: string;
    password: string;
    user: string;
    dbAvailable: boolean;
}>;
/** Baca daftar server aktif dari DB; jika DB down, pakai .env. */
export declare function loadActiveServers(): Promise<{
    servers: ServerConfig[];
    dbAvailable: boolean;
}>;
export { serverRowToConfig, parseEnvServers };
