import { type FastifyInstance } from "fastify";
export interface DashboardOptions {
    port: number;
    host: string;
    sessionSecret: string;
    /** Secret terpisah untuk refresh token (default: sessionSecret). */
    refreshSecret?: string;
    accessTokenTtlMinutes?: number;
    refreshTokenTtlDays?: number;
    cookieSecure?: boolean;
    user: string;
    password: string;
    /** Seed server store langsung (opsional; dipakai test / bootstrap tanpa DB). */
    servers?: Array<{
        id?: number;
        name: string;
        url: string;
        port?: number | null;
        token: string;
        enabled?: boolean;
    }>;
}
export declare function buildApp(opts: DashboardOptions): Promise<FastifyInstance>;
