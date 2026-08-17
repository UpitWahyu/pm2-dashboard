import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await buildApp(config);

try {
  await app.listen({ port: config.port, host: "127.0.0.1" });
  console.log(`[dashboard] listening → http://127.0.0.1:${config.port}`);
} catch (err) {
  console.error(`[dashboard] gagal listen: ${(err as Error).message}`);
  process.exit(1);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[dashboard] menerima ${signal}, shutdown...`);
  try {
    await app.close();
  } catch {
    // noop
  }
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
