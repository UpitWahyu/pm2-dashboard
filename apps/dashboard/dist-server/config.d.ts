export interface ServerConfig {
    name: string;
    url: string;
    token: string;
}
export interface DashboardConfig {
    port: number;
    host: string;
    sessionSecret: string;
    user: string;
    password: string;
    servers: ServerConfig[];
}
export declare function loadConfig(): DashboardConfig;
