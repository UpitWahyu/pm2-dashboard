#!/usr/bin/env node
// backup-db.mjs
// --------------
// Backup PostgreSQL ke file JSON (fallback bila pg_dump tak tersedia) dan opsional
// pg_dump plain SQL. Hasil disimpan ke ./backups/<tanggal>.json dan .sql
//
// Jalankan:  node scripts/backup-db.mjs
// Env: DATABASE_URL / PGHOST... (sama seperti app)

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "backups");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);

async function main() {
  const { Pool } = await import("pg");
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host: process.env.PGHOST ?? "localhost",
        port: Number(process.env.PGPORT ?? 5432),
        user: process.env.PGUSER ?? "postgres",
        password: process.env.PGPASSWORD ?? "",
        database: process.env.PGDATABASE ?? "pm2dash",
      });

  const s = await pool.query("SELECT key, value, description FROM secrets ORDER BY key");
  const v = await pool.query("SELECT name, url, port, token, enabled FROM servers ORDER BY id");
  const dump = { secrets: s.rows, servers: v.rows, exportedAt: new Date().toISOString() };

  const jsonPath = resolve(outDir, `pm2dash-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(dump, null, 2));
  console.log(`JSON backup → ${jsonPath}`);

  // Coba pg_dump (butuh binary di PATH); gagal = abaikan (JSON sudah cukup)
  try {
    const conn = process.env.DATABASE_URL
      ? process.env.DATABASE_URL
      : `postgres://${process.env.PGUSER ?? "postgres"}:${process.env.PGPASSWORD ?? ""}@${process.env.PGHOST ?? "localhost"}:${process.env.PGPORT ?? 5432}/${process.env.PGDATABASE ?? "pm2dash"}`;
    const sqlPath = resolve(outDir, `pm2dash-${stamp}.sql`);
    execFileSync("pg_dump", ["--clean", "--if-exists", "-F", "p", conn, "-f", sqlPath], { stdio: "ignore" });
    console.log(`SQL  backup → ${sqlPath}`);
  } catch {
    console.log("(pg_dump tidak tersedia — backup JSON saja)");
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Backup gagal:", err.message);
  process.exit(1);
});
