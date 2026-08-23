import { Pool } from "pg";
// ---------------------------------------------------------------------------
// PostgreSQL connection layer
// ---------------------------------------------------------------------------
// Connection resolved from DATABASE_URL, or individual PG* env vars.
// The pool is created lazily on first use and shared for the process lifetime.
let pool = null;
export function getPool() {
    if (pool)
        return pool;
    const connectionString = process.env["DATABASE_URL"];
    if (connectionString && connectionString.length > 0) {
        pool = new Pool({ connectionString });
    }
    else {
        pool = new Pool({
            host: process.env["PGHOST"] ?? "localhost",
            port: Number(process.env["PGPORT"] ?? 5432),
            user: process.env["PGUSER"] ?? "postgres",
            password: process.env["PGPASSWORD"] ?? "",
            database: process.env["PGDATABASE"] ?? "pm2dash",
        });
    }
    // Tolerate transient idle errors (jangan crash process saat koneksi putus)
    pool.on("error", (err) => {
        console.error(`[db] idle client error: ${err.message}`);
    });
    return pool;
}
export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
/** Cek cepat apakah DB bisa dihubungi (tanpa throw). */
export async function dbAvailable() {
    try {
        const res = await getPool().query("SELECT 1 AS ok");
        return res.rows[0]?.ok === 1;
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
export async function ensureSchema() {
    await getPool().query(`
    CREATE TABLE IF NOT EXISTS secrets (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      description TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS servers (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      url        TEXT NOT NULL,
      port       INTEGER,
      token      TEXT NOT NULL,
      enabled    BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_servers_enabled ON servers (enabled);
  `);
}
// ---------------------------------------------------------------------------
// Secrets CRUD
// ---------------------------------------------------------------------------
export async function getSecret(key) {
    const res = await getPool().query("SELECT value FROM secrets WHERE key = $1", [key]);
    return res.rows[0]?.value ?? null;
}
export async function getSecrets(keys) {
    const res = await getPool().query("SELECT key, value FROM secrets WHERE key = ANY($1)", [keys]);
    const out = {};
    for (const row of res.rows) {
        out[row.key] = row.value;
    }
    return out;
}
export async function setSecret(key, value, description) {
    await getPool().query(`INSERT INTO secrets (key, value, description, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           description = COALESCE(EXCLUDED.description, secrets.description),
           updated_at = now()`, [key, value, description ?? null]);
}
/** Batch upsert secrets dalam satu transaksi. */
export async function setSecrets(entries) {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        for (const e of entries) {
            await client.query(`INSERT INTO secrets (key, value, description, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [e.key, e.value, e.description ?? null]);
        }
        await client.query("COMMIT");
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
export async function listServers(onlyEnabled = false) {
    const sql = onlyEnabled
        ? "SELECT * FROM servers WHERE enabled = TRUE ORDER BY id"
        : "SELECT * FROM servers ORDER BY id";
    const res = await getPool().query(sql);
    return res.rows;
}
export async function getServerById(id) {
    const res = await getPool().query("SELECT * FROM servers WHERE id = $1", [id]);
    return res.rows[0] ?? null;
}
export async function getServerByName(name) {
    const res = await getPool().query("SELECT * FROM servers WHERE name = $1", [name]);
    return res.rows[0] ?? null;
}
/** Upsert by name. Mengembalikan { row, created }. */
export async function upsertServer(input) {
    const existing = await getServerByName(input.name);
    const res = await getPool().query(`INSERT INTO servers (name, url, port, token, enabled, updated_at)
     VALUES ($1, $2, $3, $4, TRUE, now())
     ON CONFLICT (name) DO UPDATE
       SET url = EXCLUDED.url, port = EXCLUDED.port, token = EXCLUDED.token,
           enabled = TRUE, updated_at = now()
     RETURNING *`, [input.name, input.url, input.port ?? null, input.token]);
    return { row: res.rows[0], created: !existing };
}
export async function updateServer(id, patch) {
    const cur = await getServerById(id);
    if (!cur)
        return null;
    const name = patch.name ?? cur.name;
    const url = patch.url ?? cur.url;
    const port = patch.port === undefined ? cur.port : patch.port;
    const token = patch.token ?? cur.token;
    const enabled = patch.enabled === undefined ? cur.enabled : patch.enabled;
    const res = await getPool().query(`UPDATE servers
     SET name = $2, url = $3, port = $4, token = $5, enabled = $6, updated_at = now()
     WHERE id = $1
     RETURNING *`, [id, name, url, port, token, enabled]);
    return res.rows[0] ?? null;
}
export async function deleteServer(id) {
    const res = await getPool().query("DELETE FROM servers WHERE id = $1", [id]);
    return (res.rowCount ?? 0) > 0;
}
/** Export seluruh data (untuk backup di luar pg_dump). */
export async function dumpData() {
    const s = await getPool().query("SELECT key, value, description FROM secrets ORDER BY key");
    const v = await getPool().query("SELECT name, url, port, token, enabled FROM servers ORDER BY id");
    return {
        secrets: s.rows,
        servers: v.rows,
    };
}
/** Restore dari dump (upsert semua baris). */
export async function restoreData(dump) {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        for (const e of dump.secrets) {
            await client.query(`INSERT INTO secrets (key, value, description, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [e.key, e.value, e.description]);
        }
        for (const s of dump.servers) {
            await client.query(`INSERT INTO servers (name, url, port, token, enabled, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (name) DO UPDATE
           SET url = EXCLUDED.url, port = EXCLUDED.port, token = EXCLUDED.token,
               enabled = EXCLUDED.enabled, updated_at = now()`, [s.name, s.url, s.port, s.token, s.enabled]);
        }
        await client.query("COMMIT");
    }
    catch (err) {
        await client.query("ROLLBACK");
        throw err;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=database.js.map