export class AgentError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
const TIMEOUT_MS = 6000;
export async function agentFetch(cfg, path, init = {}) {
    let res;
    try {
        res = await fetch(`${cfg.url}${path}`, {
            ...init,
            headers: {
                ...init.headers,
                authorization: `Bearer ${cfg.token}`,
                "content-type": "application/json",
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    }
    catch (err) {
        throw new AgentError(502, `agent '${cfg.name}' tidak bisa dihubungi: ${err.message}`);
    }
    let body = null;
    try {
        body = await res.json();
    }
    catch {
        // non-JSON response
    }
    return { status: res.status, body };
}
function requireOk(r) {
    if (r.status === 401)
        throw new AgentError(502, "token agent ditolak (unauthorized)");
    if (r.status === 404)
        throw new AgentError(404, "proses tidak ditemukan di agent");
    if (r.status !== 200)
        throw new AgentError(502, `agent error HTTP ${r.status}`);
    return r.body;
}
export async function getServerSummary(cfg) {
    const start = Date.now();
    try {
        const r = await agentFetch(cfg, "/api/processes");
        const latencyMs = Date.now() - start;
        const processes = (requireOk(r).processes ?? []);
        const counts = { online: 0, stopped: 0, errored: 0, other: 0, total: processes.length };
        let cpu = 0;
        let memory = 0;
        for (const p of processes) {
            if (p.status === "online")
                counts.online += 1;
            else if (p.status === "stopped")
                counts.stopped += 1;
            else if (p.status === "errored")
                counts.errored += 1;
            else
                counts.other += 1;
            cpu += p.cpu;
            memory += p.memory;
        }
        return { name: cfg.name, online: true, latencyMs, error: null, counts, cpu, memory };
    }
    catch (err) {
        return {
            name: cfg.name,
            online: false,
            latencyMs: null,
            error: err.message,
            counts: { online: 0, stopped: 0, errored: 0, other: 0, total: 0 },
            cpu: 0,
            memory: 0,
        };
    }
}
export async function getProcesses(cfg) {
    const r = await agentFetch(cfg, "/api/processes");
    return (requireOk(r).processes ?? []);
}
export async function getProcessDetail(cfg, id) {
    const r = await agentFetch(cfg, `/api/processes/${encodeURIComponent(String(id))}`);
    return requireOk(r);
}
export async function runProcessAction(cfg, id, action) {
    const r = await agentFetch(cfg, `/api/processes/${encodeURIComponent(String(id))}/${action}`, { method: "POST" });
    const body = requireOk(r);
    return body.process ?? null;
}
export async function getProcessLogs(cfg, id, lines, stream) {
    const r = await agentFetch(cfg, `/api/processes/${encodeURIComponent(String(id))}/logs?lines=${lines}&stream=${stream}`);
    return requireOk(r);
}
//# sourceMappingURL=agents.js.map