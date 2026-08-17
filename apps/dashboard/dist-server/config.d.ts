export interface ServerConfig {
    name: string;
    url: string;
    token: string;
}
export interface DashboardConfig {
    port: number;
    sessionSecret: string;
    user: string;
    password: string;
    servers: ServerConfig[];
}
export declare function loadConfig(): DashboardConfig;
