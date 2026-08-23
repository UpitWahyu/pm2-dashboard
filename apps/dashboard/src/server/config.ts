import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// .env dicari di beberapa lokasi agar tahan terhadap cwd & src/dist (sama seperti agent)
const here = import.meta.dirname;
for (const candidate of [resolve(here, ".env"), resolve(here, "../.env"), resolve(here, "../../../.env")]) {
  loadEnv({ path: candidate });
}

export interface ServerConfig {
  name: string;
  url: string;
  token: string;
}

export interface DashboardConfig {
  port: number;
  host: string;
  sessionSecret: string;
  user: string;
  password: string;
  servers: ServerConfig[];
}

function required(name: string, minLen: number): string {
  const value = process.env[name] ?? "";
  if (value.length < minLen) {
    throw new Error(`[config] ${name} wajib diisi (min ${minLen} karakter) — cek apps/dashboard/.env`);
  }
  return value;
}

export function loadConfig(): DashboardConfig {
  const port = Number(process.env["PORT"] ?? 4100);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("[config] PORT tidak valid");
  }

  let servers: ServerConfig[];
  try {
    const raw = JSON.parse(required("DASHBOARD_SERVERS", 2)) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("kosong");
    servers = raw.map((s) => {
      const item = s as Partial<ServerConfig>;
      if (typeof item.name !== "string" || typeof item.url !== "string" || typeof item.token !== "string" || item.token.length < 16) {
        throw new Error("format salah");
      }
      return { name: item.name, url: item.url.replace(/\/+$/, ""), token: item.token };
    });
  } catch {
    throw new Error("[config] DASHBOARD_SERVERS tidak valid — JSON array [{name,url,token}] dengan token min 16 karakter");
  }

  return {
    port,
    host: process.env["HOST"] ?? "127.0.0.1",
    sessionSecret: required("SESSION_SECRET", 16),
    user: required("DASHBOARD_USER", 1),
    password: required("DASHBOARD_PASSWORD", 6),
    servers,
  };
}
