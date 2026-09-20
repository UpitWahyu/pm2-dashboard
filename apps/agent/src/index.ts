import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { LiveHub } from "./live.js";
import { connectPm2, disconnectPm2 } from "./pm2.js";

const config = loadConfig();
const hub = new LiveHub();

try {
  await connectPm2();
  console.log(`[agent] '${config.name}' terhubung ke daemon PM2`);
} catch (err) {
  console.error(`[agent] gagal connect ke daemon PM2: ${(err as Error).message}`);
  process.exit(1);
}

hub.start();

const app = await buildApp({ token: config.token, name: config.name, version: "0.1.0", hub });

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`[agent] '${config.name}' listening → http://${config.host}:${config.port}`);
} catch (err) {
  console.error(`[agent] gagal listen: ${(err as Error).message}`);
  process.exit(1);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[agent] menerima ${signal}, shutdown...`);
  try {
    await app.close();
  } catch {
    // noop
  }
  disconnectPm2();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
