import * as db from "./database.js";
import { loadActiveServers, serverRowToConfig } from "./config.js";
/**
 * Penyimpanan server in-memory yang bisa di-update saat runtime (hot-reload).
 *
 * Routes & live WS membaca dari sini, BUKAN dari array statis. Saat admin
 * menambah/edit/hapus server lewat API, kita perbarui store tanpa restart PM2.
 */
export class ServerStore {
    servers = [];
    byName = new Map();
    loaded = false;
    /** Muat awal dari DB (atau .env fallback). */
    async init() {
        const { servers } = await loadActiveServers();
        this.setServers(servers);
        this.loaded = true;
    }
    setServers(list) {
        this.servers = list;
        this.byName = new Map(list.map((s) => [s.name, s]));
    }
    getServers() {
        return this.servers;
    }
    getEnabledServers() {
        return this.servers.filter((s) => s.enabled);
    }
    findByName(name) {
        return this.byName.get(name);
    }
    /**
     * Reload dari DB. Mengembalikan daftar server terbaru (hanya enabled).
     * Jika DB tidak tersedia, pertahankan daftar saat ini.
     */
    async reload() {
        const { servers, dbAvailable } = await loadActiveServers();
        if (dbAvailable || servers.length > 0) {
            this.setServers(servers);
        }
        else {
            console.warn("[store] reload: DB tidak tersedia, pertahankan daftar server saat ini");
        }
        return this.servers;
    }
    /** Insert/update dari DB row (dipakai setelah mutation). */
    async refreshFromDb() {
        const res = await db.listServers(true);
        this.setServers(res.map(serverRowToConfig));
    }
}
export const serverStore = new ServerStore();
//# sourceMappingURL=serverStore.js.map