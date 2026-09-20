import type { FastifyInstance } from "fastify";
export interface AuthOptions {
    user: string;
    password: string;
    /** Secret terpisah untuk refresh token. */
    refreshSecret: string;
    /** TTL access token dalam menit (default 15). */
    accessTokenTtlMinutes: number;
    /** TTL refresh token dalam hari (default 7). */
    refreshTokenTtlDays: number;
    /** Set flag `secure` pada cookie (butuh HTTPS). */
    cookieSecure: boolean;
}
export declare function registerAuth(app: FastifyInstance, opts: AuthOptions): Promise<void>;
