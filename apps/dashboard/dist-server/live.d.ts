import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "./agents.js";
export declare function registerLiveWs(app: FastifyInstance, servers: ServerConfig[]): void;
