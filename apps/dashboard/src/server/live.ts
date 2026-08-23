import type { FastifyInstance } from "fastify";
import { serverStore } from "./serverStore.js";

interface WsSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", cb: (data: unknown) => void): void;
  on(event: "close", cb: () => void): void;
}

interface AgentWs {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

declare const WebSocket: new (url: string) => AgentWs;

const OPEN = 1;

function toText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Buffer) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data.map((d) => Buffer.from(d as ArrayBuffer))).toString("utf8");
  return String(data);
}

// Proxy WS: browser → dashboard (cookie auth) → agent (first-message auth token)
export function registerLiveWs(app: FastifyInstance): void {
  app.get("/ws/live", { websocket: true }, (socket: WsSocket, req) => {
    const name = ((req.query as { server?: string }).server ?? "").trim();
    // baca dari store (hot-reload): server yang baru ditambah langsung aktif
    const cfg = serverStore.findByName(name);
    if (!cfg) {
      socket.close(4404, "SERVER_NOT_FOUND");
      return;
    }
    const agentUrl = `${cfg.url.replace(/^http/i, "ws")}/api/live`;
    let agent: AgentWs;
    try {
      agent = new WebSocket(agentUrl);
    } catch {
      socket.close(4400, "BAD_AGENT_URL");
      return;
    }
    agent.onopen = () => {
      agent.send(JSON.stringify({ type: "auth", token: cfg.token }));
    };
    agent.onmessage = (ev) => {
      if (socket.readyState === OPEN) {
        try {
          socket.send(toText(ev.data));
        } catch {
          // client rusak — ditutup oleh close handler
        }
      }
    };
    agent.onerror = () => {
      try {
        socket.close(1011, "AGENT_ERROR");
      } catch {
        // noop
      }
    };
    agent.onclose = () => {
      try {
        socket.close();
      } catch {
        // noop
      }
    };
    socket.on("message", (raw) => {
      if (agent.readyState === OPEN) {
        try {
          agent.send(toText(raw));
        } catch {
          // noop
        }
      }
    });
    socket.on("close", () => {
      try {
        agent.close();
      } catch {
        // noop
      }
    });
  });
}
