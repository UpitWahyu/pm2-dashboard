import * as db from "./database.js";
import { loadConfig, resolveSecrets } from "./config.js";
import { serverStore } from "./serverStore.js";
import { buildApp } from "./app.js";
const base = await loadConfig();
const secrets = await resolveSecrets(base);
// Inisialisasi DB (buat schema kalau perlu) + store server.
let usingDb = false;
try {
    await db.ensureSchema();
    await serverStore.init();
    usingDb = true;
    console.log("[dashboard] database aktif — server & secret dimuat dari PostgreSQL");
}
catch (err) {
    console.warn(`[dashboard] database TIDAK tersedia (${err.message}); pakai .env fallback`);
    await serverStore.init(); // serverStore.init otomatis fallback ke .env jika DB down
}
const app = await buildApp({
    port: base.port,
    host: base.host,
    sessionSecret: secrets.sessionSecret,
    user: secrets.user,
    password: secrets.password,
});
try {
    await app.listen({ port: base.port, host: base.host });
    console.log(`[dashboard] listening → http://${base.host}:${base.port} (db=${usingDb ? "on" : "off"})`);
}
catch (err) {
    console.error(`[dashboard] gagal listen: ${err.message}`);
    process.exit(1);
}
async function shutdown(signal) {
    console.log(`[dashboard] menerima ${signal}, shutdown...`);
    try {
        await app.close();
    }
    catch {
        // noop
    }
    try {
        await db.closePool();
    }
    catch {
        // noop
    }
    process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
//# sourceMappingURL=index.js.map