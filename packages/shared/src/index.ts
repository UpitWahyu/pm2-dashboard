import { z } from "zod";

// ---------- Types (agent ↔ dashboard) ----------

export interface ProcessSummary {
  name: string;
  pm_id: number;
  status: string; // online | stopped | errored | launching | ...
  cpu: number; // % (0-100)
  memory: number; // bytes
  uptime: number; // epoch ms saat start terakhir (pm_uptime = startTime; durasi = now - uptime)
  restarts: number;
  unstableRestarts: number;
  outLogPath: string | null;
  errLogPath: string | null;
  createdAt: number | null; // epoch ms
  version: string | null;
}

export interface ProcessDetail extends ProcessSummary {
  pid: number | null;
  script: string | null;
  execInterpreter: string | null;
  nodeVersion: string | null;
  pm2Version: string | null;
}

export interface AgentHealth {
  ok: boolean;
  name: string;
  version: string;
  pm2Connected: boolean;
}

export interface ServerSummary {
  name: string;
  online: boolean;
  latencyMs: number | null;
  error: string | null;
  counts: { online: number; stopped: number; errored: number; other: number; total: number };
  cpu: number;
  memory: number;
}

export type LogStream = "all" | "out" | "err";

export interface LogLine {
  stream: "out" | "err";
  line: string; // isi baris TANPA timestamp (sudah dipisah)
  timestamp: string; // YYYY-MM-DDTHH:mm:ss (kosong jika tak terdeteksi)
}

export interface LogTailResult {
  stream: LogStream;
  lines: LogLine[]; // "all": merged & sorted; "out"/"err": hanya stream tsb
  total: number;
}

export type LiveMessage =
  | { type: "auth:ok" }
  | { type: "log"; data: { stream: "out" | "err"; name: string; pm_id: number; line: string } }
  | { type: "process:event"; data: { event: string; name: string; pm_id: number; status?: string } };

// ---------- Zod schemas ----------

export const LogQuerySchema = z.object({
  lines: z.coerce.number().int().min(1).max(2000).default(100),
  stream: z.enum(["all", "out", "err"]).default("all"),
});

export const WsAuthMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1),
});
