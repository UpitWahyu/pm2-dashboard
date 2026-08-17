import type { LogStream, LogTailResult, ProcessDetail, ProcessSummary, ServerSummary } from "@pm2-dashboard/shared";
export interface ServerConfig {
    name: string;
    url: string;
    token: string;
}
export declare class AgentError extends Error {
    status: number;
    constructor(status: number, message: string);
}
export declare function agentFetch(cfg: ServerConfig, path: string, init?: RequestInit): Promise<{
    status: number;
    body: unknown;
}>;
export declare function getServerSummary(cfg: ServerConfig): Promise<ServerSummary>;
export declare function getProcesses(cfg: ServerConfig): Promise<ProcessSummary[]>;
export declare function getProcessDetail(cfg: ServerConfig, id: number | string): Promise<ProcessDetail>;
export type AgentAction = "restart" | "stop" | "start" | "delete";
export declare function runProcessAction(cfg: ServerConfig, id: number | string, action: AgentAction): Promise<ProcessDetail | null>;
export declare function getProcessLogs(cfg: ServerConfig, id: number | string, lines: number, stream: LogStream): Promise<LogTailResult>;
