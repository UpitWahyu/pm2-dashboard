import { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./agents.js";
export interface DashboardOptions {
    port: number;
    host: string;
    sessionSecret: string;
    user: string;
    password: string;
    servers: ServerConfig[];
}
export declare function buildApp(opts: DashboardOptions): Promise<FastifyInstance>;
