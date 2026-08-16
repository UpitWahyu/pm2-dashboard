import type { EventEmitter } from "node:events";
import "@fastify/websocket"; // module augmentation: RouteShorthandOptions.websocket
import pm2 from "pm2";
import { WsAuthMessageSchema, type LiveMessage } from "@pm2-dashboard/shared";
import { isValidToken } from "./auth.js";

// types PM2 tidak menyertakan launchBus — cast minimal (PM2 7: connectBus diganti launchBus)
const pm2Bus = pm2 as unknown as {
  launchBus(cb: (err: Error | null, bus: EventEmitter) => void): void;
};

interface WsSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", cb: (data: unknown) => void): void;
  on(event: "close", cb: () => void): void;
}

const OPEN = 1;

function toText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof Buffer) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) {
    return Buffer.concat(data.map((d) => Buffer.from(d as ArrayBuffer))).toString("utf8");
  }
  return String(data);
}

export class LiveHub {
  private readonly clients = new Set<WsSocket>();
  private started = false;

  addClient(socket: WsSocket): void {
    this.clients.add(socket);
  }

  removeClient(socket: WsSocket): void {
    this.clients.delete(socket);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    pm2Bus.launchBus((err, bus) => {
      if (err) {
        console.error(`[live] gagal connectBus: ${err.message}`);
        return;
      }
      bus.on("log:out", (ev: any) =>
        this.broadcast({
          type: "log",
          data: { stream: "out", name: String(ev.process?.name ?? "?"), pm_id: Number(ev.process?.pm_id ?? -1), line: String(ev.data ?? "") },
        }),
      );
      bus.on("log:err", (ev: any) =>
        this.broadcast({
          type: "log",
          data: { stream: "err", name: String(ev.process?.name ?? "?"), pm_id: Number(ev.process?.pm_id ?? -1), line: String(ev.data ?? "") },
        }),
      );
      bus.on("process:event", (ev: any) =>
        this.broadcast({
          type: "process:event",
          data: {
            event: String(ev.event ?? ""),
            name: String(ev.process?.name ?? "?"),
            pm_id: Number(ev.process?.pm_id ?? -1),
            status: ev.process?.status ? String(ev.process.status) : undefined,
          },
        }),
      );
      console.log("[live] bus PM2 aktif");
    });
  }

  private broadcast(message: LiveMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === OPEN) {
        try {
          client.send(payload);
        } catch {
          // client rusak — dibersihkan oleh close handler
        }
      }
    }
  }
}

export function registerLiveWs(app: import("fastify").FastifyInstance, hub: LiveHub, token: string): void {
  app.get("/api/live", { websocket: true }, (socket: WsSocket) => {
    let authed = false;
    socket.on("message", (raw) => {
      if (!authed) {
        try {
          const msg = WsAuthMessageSchema.parse(JSON.parse(toText(raw)));
          if (isValidToken(msg.token, token)) {
            authed = true;
            hub.addClient(socket);
            socket.send(JSON.stringify({ type: "auth:ok" }));
          } else {
            socket.close(4401, "UNAUTHORIZED");
          }
        } catch {
          socket.close(4400, "BAD_MESSAGE");
        }
        return;
      }
      // Fase lanjutan: pesan subscribe per-app — belum dibutuhkan
    });
    socket.on("close", () => {
      hub.removeClient(socket);
    });
  });
}
