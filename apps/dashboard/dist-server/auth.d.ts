import type { FastifyInstance } from "fastify";
export interface AuthOptions {
    user: string;
    password: string;
}
export declare function registerAuth(app: FastifyInstance, opts: AuthOptions): Promise<void>;
