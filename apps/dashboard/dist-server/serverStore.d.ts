import type { ServerConfig } from "./config.js";
/**
 * Penyimpanan server in-memory yang bisa di-update saat runtime (hot-reload).
 *
 * Routes & live WS membaca dari sini, BUKAN dari array statis. Saat admin
 * menambah/edit/hapus server lewat API, kita perbarui store tanpa restart PM2.
 */
export declare class ServerStore {
    private servers;
    private byName;
    private loaded;
    /** Muat awal dari DB (atau .env fallback). */
    init(): Promise<void>;
    private setServers;
    /** Seed store langsung (dipakai test / bootstrap tanpa DB). */
    seed(list: ServerConfig[]): void;
    getServers(): ServerConfig[];
    getEnabledServers(): ServerConfig[];
    findByName(name: string): ServerConfig | undefined;
    /**
     * Reload dari DB. Mengembalikan daftar server terbaru (hanya enabled).
     * Jika DB tidak tersedia, pertahankan daftar saat ini.
     */
    reload(): Promise<ServerConfig[]>;
    /** Insert/update dari DB row (dipakai setelah mutation). */
    refreshFromDb(): Promise<void>;
}
export declare const serverStore: ServerStore;
