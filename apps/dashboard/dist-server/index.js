import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
const config = loadConfig();
const app = await buildApp(config);
try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`[dashboard] listening → http://${config.host}:${config.port}`);
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
    process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
//# sourceMappingURL=index.js.map