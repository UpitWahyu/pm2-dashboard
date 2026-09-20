import { Pool } from "pg";
export declare function getPool(): Pool;
export declare function closePool(): Promise<void>;
/** Cek cepat apakah DB bisa dihubungi (tanpa throw). */
export declare function dbAvailable(): Promise<boolean>;
export declare function ensureSchema(): Promise<void>;
export declare function getSecret(key: string): Promise<string | null>;
export declare function getSecrets(keys: string[]): Promise<Record<string, string>>;
export declare function setSecret(key: string, value: string, description?: string): Promise<void>;
/** Batch upsert secrets dalam satu transaksi. */
export declare function setSecrets(entries: Array<{
    key: string;
    value: string;
    description?: string;
}>): Promise<void>;
export interface ServerRow {
    id: number;
    name: string;
    url: string;
    port: number | null;
    token: string;
    enabled: boolean;
    created_at: Date;
    updated_at: Date;
}
export declare function listServers(onlyEnabled?: boolean): Promise<ServerRow[]>;
export declare function getServerById(id: number): Promise<ServerRow | null>;
export declare function getServerByName(name: string): Promise<ServerRow | null>;
export interface ServerInput {
    name: string;
    url: string;
    port?: number | null;
    token: string;
}
/** Upsert by name. Mengembalikan { row, created }. */
export declare function upsertServer(input: ServerInput): Promise<{
    row: ServerRow;
    created: boolean;
}>;
export declare function updateServer(id: number, patch: Partial<{
    name: string;
    url: string;
    port: number | null;
    token: string;
    enabled: boolean;
}>): Promise<ServerRow | null>;
export declare function deleteServer(id: number): Promise<boolean>;
export interface RefreshTokenRow {
    id: number;
    token_hash: string;
    username: string;
    created_at: Date;
    last_used_at: Date | null;
    expires_at: Date;
    revoked_at: Date | null;
}
export declare function insertRefreshToken(tokenHash: string, username: string, expiresAt: Date): Promise<void>;
export declare function findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | null>;
export declare function touchRefreshToken(tokenHash: string): Promise<void>;
export declare function revokeRefreshToken(tokenHash: string): Promise<void>;
export declare function revokeAllRefreshTokens(username: string): Promise<void>;
export declare function deleteExpiredRefreshTokens(): Promise<number>;
export interface DbDump {
    secrets: Array<{
        key: string;
        value: string;
        description: string | null;
    }>;
    servers: Array<{
        name: string;
        url: string;
        port: number | null;
        token: string;
        enabled: boolean;
    }>;
}
/** Export seluruh data (untuk backup di luar pg_dump). */
export declare function dumpData(): Promise<DbDump>;
/** Restore dari dump (upsert semua baris). */
export declare function restoreData(dump: DbDump): Promise<void>;
