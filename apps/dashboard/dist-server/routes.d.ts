import type { FastifyInstance } from "fastify";
import { type ServerConfig } from "./agents.js";
export declare function registerRoutes(app: FastifyInstance, servers: ServerConfig[]): Promise<void>;
