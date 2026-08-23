import type { LogStream, LogTailResult, ProcessDetail, ProcessSummary, ServerSummary } from "@pm2-dashboard/shared";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), "content-type": "application/json" },
  });
  if (res.status === 401) {
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // non-JSON
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export interface LoginResult {
  ok: boolean;
}

export type ProcessAction = "restart" | "stop" | "start" | "delete";

export const api = {
  login: (username: string, password: string) =>
    request<LoginResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<LoginResult>("/api/auth/logout", { method: "POST", body: "{}" }),
  me: () => request<{ username: string | null }>("/api/auth/me"),
  servers: () => request<{ servers: ServerSummary[] }>("/api/servers"),
  processes: (serverName: string) =>
    request<{ processes: ProcessSummary[] }>(`/api/servers/${encodeURIComponent(serverName)}/processes`),
  action: (serverName: string, id: number | string, action: ProcessAction) =>
    request<{ ok: true; action: string; process: ProcessDetail | null }>(
      `/api/servers/${encodeURIComponent(serverName)}/processes/${encodeURIComponent(String(id))}/${action}`,
      { method: "POST", body: "{}" },
    ),
  logs: (serverName: string, id: number | string, lines: number, stream: LogStream) =>
    request<LogTailResult>(
      `/api/servers/${encodeURIComponent(serverName)}/processes/${encodeURIComponent(String(id))}/logs?lines=${lines}&stream=${stream}`,
    ),
  // --- Server management ---
  manageServers: () => request<{ servers: ManagedServer[] }>("/api/servers/list"),
  createServer: (input: ServerCreateInput) =>
    request<{ server: ManagedServer }>("/api/servers", { method: "POST", body: JSON.stringify(input) }),
  updateServer: (id: number, patch: ServerPatchInput) =>
    request<{ server: ManagedServer }>(`/api/servers/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
  deleteServer: (id: number) => request<{ ok: true }>(`/api/servers/${id}`, { method: "DELETE" }),
  syncServers: () => request<{ ok: true; syncedServers: string[]; syncedSecrets: string[] }>("/api/servers/sync", { method: "POST", body: "{}" }),
  syncStatus: () => request<{ dbAvailable: boolean; envServers: number; dbServers: number }>("/api/servers/sync/status"),
};

export interface ManagedServer {
  id: number;
  name: string;
  url: string;
  port: number | null;
  token: string;
  enabled: boolean;
}

export interface ServerCreateInput {
  name: string;
  url: string;
  port?: number | null;
  token: string;
}

export interface ServerPatchInput {
  name?: string;
  url?: string;
  port?: number | null;
  token?: string;
  enabled?: boolean;
}

export function liveWsUrl(serverName: string): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/live?server=${encodeURIComponent(serverName)}`;
}
