import type { LogStream, LogTailResult, ProcessDetail, ProcessSummary, ServerSummary } from "@pm2-dashboard/shared";

export interface ServerConfig {
  name: string;
  url: string;
  token: string;
}

export class AgentError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 6000;

export async function agentFetch(cfg: ServerConfig, path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: `Bearer ${cfg.token}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new AgentError(502, `agent '${cfg.name}' tidak bisa dihubungi: ${(err as Error).message}`);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response
  }
  return { status: res.status, body };
}

function requireOk(r: { status: number; body: unknown }): unknown {
  if (r.status === 401) throw new AgentError(502, "token agent ditolak (unauthorized)");
  if (r.status === 404) throw new AgentError(404, "proses tidak ditemukan di agent");
  if (r.status !== 200) throw new AgentError(502, `agent error HTTP ${r.status}`);
  return r.body;
}

export async function getServerSummary(cfg: ServerConfig): Promise<ServerSummary> {
  const start = Date.now();
  try {
    const r = await agentFetch(cfg, "/api/processes");
    const latencyMs = Date.now() - start;
    const processes = ((requireOk(r) as { processes?: ProcessSummary[] }).processes ?? []);
    const counts = { online: 0, stopped: 0, errored: 0, other: 0, total: processes.length };
    let cpu = 0;
    let memory = 0;
    for (const p of processes) {
      if (p.status === "online") counts.online += 1;
      else if (p.status === "stopped") counts.stopped += 1;
      else if (p.status === "errored") counts.errored += 1;
      else counts.other += 1;
      cpu += p.cpu;
      memory += p.memory;
    }
    return { name: cfg.name, online: true, latencyMs, error: null, counts, cpu, memory };
  } catch (err) {
    return {
      name: cfg.name,
      online: false,
      latencyMs: null,
      error: (err as Error).message,
      counts: { online: 0, stopped: 0, errored: 0, other: 0, total: 0 },
      cpu: 0,
      memory: 0,
    };
  }
}

export async function getProcesses(cfg: ServerConfig): Promise<ProcessSummary[]> {
  const r = await agentFetch(cfg, "/api/processes");
  return ((requireOk(r) as { processes?: ProcessSummary[] }).processes ?? []);
}

export async function getProcessDetail(cfg: ServerConfig, id: number | string): Promise<ProcessDetail> {
  const r = await agentFetch(cfg, `/api/processes/${encodeURIComponent(String(id))}`);
  return requireOk(r) as ProcessDetail;
}

export type AgentAction = "restart" | "stop" | "start" | "delete";

export async function runProcessAction(cfg: ServerConfig, id: number | string, action: AgentAction): Promise<ProcessDetail | null> {
  const r = await agentFetch(cfg, `/api/processes/${encodeURIComponent(String(id))}/${action}`, { method: "POST" });
  const body = requireOk(r) as { process?: ProcessDetail | null };
  return body.process ?? null;
}

export async function getProcessLogs(cfg: ServerConfig, id: number | string, lines: number, stream: LogStream): Promise<LogTailResult> {
  const r = await agentFetch(cfg, `/api/processes/${encodeURIComponent(String(id))}/logs?lines=${lines}&stream=${stream}`);
  return requireOk(r) as LogTailResult;
}
