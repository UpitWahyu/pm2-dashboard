import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// .env dicari di beberapa lokasi agar tahan terhadap cwd & src/dist:
//   here/.env → dist|src lokal; ../.env → apps/agent/.env; ../../../.env → root repo
const here = import.meta.dirname;
for (const candidate of [resolve(here, ".env"), resolve(here, "../.env"), resolve(here, "../../../.env")]) {
  loadEnv({ path: candidate });
}

export interface AgentConfig {
  port: number;
  token: string;
  name: string;
  host: string;
}

function required(name: string, minLen: number): string {
  const value = process.env[name] ?? "";
  if (value.length < minLen) {
    throw new Error(`[config] ${name} wajib diisi (min ${minLen} karakter) — cek apps/agent/.env`);
  }
  return value;
}

export function loadConfig(): AgentConfig {
  const port = Number(process.env["PORT"] ?? 4001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("[config] PORT tidak valid");
  }
  return {
    port,
    token: required("AGENT_TOKEN", 16),
    name: process.env["AGENT_NAME"] ?? "agent",
    host: process.env["HOST"] ?? "127.0.0.1",
  };
}
