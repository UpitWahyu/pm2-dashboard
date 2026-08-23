import { type FastifyInstance } from "fastify";
export interface DashboardOptions {
    port: number;
    host: string;
    sessionSecret: string;
    user: string;
    password: string;
}
export declare function buildApp(opts: DashboardOptions): Promise<FastifyInstance>;
