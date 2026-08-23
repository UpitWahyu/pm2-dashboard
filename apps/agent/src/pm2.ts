import { open, stat } from "node:fs/promises";
import pm2 from "pm2";
import type { LogLine, LogStream, LogTailResult, ProcessDetail, ProcessSummary } from "@pm2-dashboard/shared";

interface Pm2Proc {
  name?: string;
  pm_id?: number;
  pid?: number;
  cpu?: number;
  monit?: { memory?: number };
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
    unstable_restarts?: number;
    pm_out_log_path?: string;
    pm_err_log_path?: string;
    created_at?: number;
    version?: string;
    script?: string;
    exec_interpreter?: string;
    node_version?: string;
    pm2_version?: string;
  };
}

export class ProcessNotFoundError extends Error {}

const MAX_READ_BYTES = 256 * 1024;

function normalize(proc: Pm2Proc): ProcessSummary {
  const env = proc.pm2_env ?? {};
  return {
    name: String(proc.name ?? env.status ?? "?"),
    pm_id: Number(proc.pm_id ?? -1),
    status: String(env.status ?? "unknown"),
    cpu: Number(proc.cpu ?? 0),
    memory: Number(proc.monit?.memory ?? 0),
    uptime: Number(env.pm_uptime ?? 0),
    restarts: Number(env.restart_time ?? 0),
    unstableRestarts: Number(env.unstable_restarts ?? 0),
    outLogPath: env.pm_out_log_path ? String(env.pm_out_log_path) : null,
    errLogPath: env.pm_err_log_path ? String(env.pm_err_log_path) : null,
    createdAt: env.created_at ? Number(env.created_at) : null,
    version: env.version ? String(env.version) : null,
  };
}

export function connectPm2(): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    pm2.connect((err) => (err ? rejectP(err) : resolveP()));
  });
}

export function disconnectPm2(): void {
  try {
    pm2.disconnect();
  } catch {
    // noop
  }
}

export function listProcesses(): Promise<ProcessSummary[]> {
  return new Promise((resolveP, rejectP) => {
    pm2.list((err, list) => (err ? rejectP(err) : resolveP((list ?? []).map(normalize))));
  });
}

export function describeProcess(id: number | string): Promise<ProcessDetail | null> {
  return new Promise((resolveP, rejectP) => {
    pm2.describe(id, (err, data) => {
      if (err) return rejectP(err);
      const proc = (data ?? [])[0] as Pm2Proc | undefined;
      if (!proc) return resolveP(null);
      const summary = normalize(proc);
      const env = proc.pm2_env ?? {};
      resolveP({
        ...summary,
        pid: proc.pid ?? null,
        script: env.script ?? null,
        execInterpreter: env.exec_interpreter ?? null,
        nodeVersion: env.node_version ?? null,
        pm2Version: env.pm2_version ?? null,
      });
    });
  });
}

export type Pm2Action = "restart" | "stop" | "start" | "delete";

export function runAction(action: Pm2Action, id: number | string): Promise<ProcessDetail | null> {
  return new Promise((resolveP, rejectP) => {
    // PENTING: method PM2 butuh `this` (internal _operate) — jangan di-destructure
    const fn = (pm2 as unknown as Record<
      Pm2Action,
      (target: number | string, cb: (err: Error | null) => void) => void
    >)[action];

    const finish = (err: Error | null): void => {
      if (err) {
        rejectP(/not found|does not exist/i.test(err.message) ? new ProcessNotFoundError(err.message) : err);
        return;
      }
      // Callback PM2 tidak memberi detail proses → fetch state fresh (null kalau di-delete)
      describeProcess(id).then((fresh) => resolveP(fresh), (e) => rejectP(e));
    };

    if (action === "start" && typeof id === "number") {
      // pm2.start() butuh nama/script (bukan id numeric) → resolve id → nama proses
      describeProcess(id).then((detail) => {
        if (!detail) return rejectP(new ProcessNotFoundError(`process '${id}' tidak ditemukan`));
        fn.call(pm2, detail.name, finish);
      }, (e) => rejectP(e));
      return;
    }
    fn.call(pm2, id, finish);
  });
}

export async function tailFile(path: string | null, lines: number): Promise<string> {
  if (!path) return "";
  try {
    const size = (await stat(path)).size;
    if (size === 0) return "";
    const chunk = Math.min(size, MAX_READ_BYTES);
    const fd = await open(path, "r");
    try {
      const buffer = Buffer.alloc(chunk);
      await fd.read(buffer, 0, chunk, size - chunk);
      const parts = buffer.toString("utf8").split("\n");
      if (parts.at(-1) === "") parts.pop(); // trailing newline → buang elemen kosong
      return parts.slice(-lines).join("\n");
    } finally {
      await fd.close();
    }
  } catch {
    return ""; // file belum ada / sedang rotate
  }
}

// PM2 menulis: `YYYY-MM-DDTHH:mm:ss: <isi baris>` (21 char offset: 19 ts + ": ")
const TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}):/;

// Parse isi file log jadi LogLine[] terurut (asc). Baris tanpa timestamp
// (continuation line) di-attach ke baris sebelumnya; baris pertama tanpa
// timestamp tetap di-include dengan timestamp kosong.
function parseLogLines(text: string, stream: "out" | "err"): LogLine[] {
  const out: LogLine[] = [];
  const rawLines = text.split("\n");
  for (const raw of rawLines) {
    if (raw.length === 0) continue;
    const m = TS_RE.exec(raw);
    if (m) {
      out.push({ stream, timestamp: m[1] ?? "", line: raw.slice(21) });
    } else {
      const last = out[out.length - 1];
      if (last) {
        // continuation line → gabung ke baris terakhir
        last.line += "\n" + raw;
      } else {
        out.push({ stream, timestamp: "", line: raw });
      }
    }
  }
  return out;
}

export async function tailLogs(id: number | string, lines: number, stream: LogStream): Promise<LogTailResult> {
  const detail = await describeProcess(id);
  if (!detail) throw new ProcessNotFoundError(`process '${id}' tidak ditemukan`);

  if (stream === "out" || stream === "err") {
    const text = await tailFile(stream === "out" ? detail.outLogPath : detail.errLogPath, lines);
    const sliced = parseLogLines(text, stream).slice(-lines);
    return { stream, lines: sliced, total: sliced.length };
  }

  // stream === "all": baca kedua file, merge berdasarkan timestamp, ambil N terakhir
  const [outText, errText] = await Promise.all([
    tailFile(detail.outLogPath, lines),
    tailFile(detail.errLogPath, lines),
  ]);
  const merged = [...parseLogLines(outText, "out"), ...parseLogLines(errText, "err")];
  // sort ascending berdasarkan timestamp; baris tanpa ts (timestamp=="") diakhir
  merged.sort((a, b) => {
    if (a.timestamp === b.timestamp) return 0;
    if (a.timestamp === "") return 1;
    if (b.timestamp === "") return -1;
    return a.timestamp < b.timestamp ? -1 : 1;
  });
  const sliced = merged.slice(-lines);
  return { stream: "all", lines: sliced, total: sliced.length };
}
