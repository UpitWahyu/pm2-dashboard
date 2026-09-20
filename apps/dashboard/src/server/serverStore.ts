import * as db from "./database.js";
import type { ServerConfig } from "./config.js";
import { loadActiveServers, serverRowToConfig } from "./config.js";

/**
 * Penyimpanan server in-memory yang bisa di-update saat runtime (hot-reload).
 *
 * Routes & live WS membaca dari sini, BUKAN dari array statis. Saat admin
 * menambah/edit/hapus server lewat API, kita perbarui store tanpa restart PM2.
 */
export class ServerStore {
  private servers: ServerConfig[] = [];
  private byName = new Map<string, ServerConfig>();
  private loaded = false;

  /** Muat awal dari DB (atau .env fallback). */
  async init(): Promise<void> {
    const { servers } = await loadActiveServers();
    this.setServers(servers);
    this.loaded = true;
  }

  private setServers(list: ServerConfig[]): void {
    this.servers = list;
    this.byName = new Map(list.map((s) => [s.name, s]));
  }

  /** Seed store langsung (dipakai test / bootstrap tanpa DB). */
  seed(list: ServerConfig[]): void {
    this.setServers(list);
    this.loaded = true;
  }

  getServers(): ServerConfig[] {
    return this.servers;
  }

  getEnabledServers(): ServerConfig[] {
    return this.servers.filter((s) => s.enabled);
  }

  findByName(name: string): ServerConfig | undefined {
    return this.byName.get(name);
  }

  /**
   * Reload dari DB. Mengembalikan daftar server terbaru (hanya enabled).
   * Jika DB tidak tersedia, pertahankan daftar saat ini.
   */
  async reload(): Promise<ServerConfig[]> {
    const { servers, dbAvailable } = await loadActiveServers();
    if (dbAvailable || servers.length > 0) {
      this.setServers(servers);
    } else {
      console.warn("[store] reload: DB tidak tersedia, pertahankan daftar server saat ini");
    }
    return this.servers;
  }

  /** Insert/update dari DB row (dipakai setelah mutation). */
  async refreshFromDb(): Promise<void> {
    const res = await db.listServers(true);
    this.setServers(res.map(serverRowToConfig));
  }
}

export const serverStore = new ServerStore();
