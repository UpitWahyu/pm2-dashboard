#!/usr/bin/env node
// migrate-env-to-db.mjs
// ----------------------
// One-shot migration: baca apps/dashboard/.env (DASHBOARD_SERVERS + secret login)
// lalu tulis ke PostgreSQL. Idempoten (pakai upsert by name).
//
// Jalankan:  node scripts/migrate-env-to-db.mjs
// (pastikan docker compose up -d sudah jalan & DATABASE_URL ter-set)
//
// Env yang dibutuhkan (bisa dari .env root atau shell):
//   DATABASE_URL=postgres://pm2dash:pm2dash@localhost:5432/pm2dash
//   atau PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
for (const p of [resolve(root, "apps/dashboard/.env"), resolve(root, ".env")]) {
  loadEnv({ path: p });
}

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "",
      database: process.env.PGDATABASE ?? "pm2dash",
    });

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS secrets (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS servers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, url TEXT NOT NULL,
      port INTEGER, token TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function setSecret(key, value, description) {
  return pool.query(
    `INSERT INTO secrets (key, value, description, updated_at)
     VALUES ($1,$2,$3,now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value, description],
  );
}

function upsertServer(name, url, port, token) {
  return pool.query(
    `INSERT INTO servers (name, url, port, token, enabled, updated_at)
     VALUES ($1,$2,$3,$4,TRUE,now())
     ON CONFLICT (name) DO UPDATE
       SET url = EXCLUDED.url, port = EXCLUDED.port, token = EXCLUDED.token,
           enabled = TRUE, updated_at = now()`,
    [name, url, port, token],
  );
}

async function main() {
  await ensureSchema();

  const raw = process.env.DASHBOARD_SERVERS;
  let count = 0;
  if (raw) {
    const arr = JSON.parse(raw);
    for (const s of arr) {
      await upsertServer(s.name, s.url, s.port ?? null, s.token);
      count++;
      console.log(`  + server ${s.name}`);
    }
  }

  const secrets = [
    ["SESSION_SECRET", process.env.SESSION_SECRET, "Session JWT secret"],
    ["DASHBOARD_PASSWORD", process.env.DASHBOARD_PASSWORD, "Password login dashboard"],
    ["DASHBOARD_USER", process.env.DASHBOARD_USER, "Username login dashboard"],
  ];
  for (const [k, v, d] of secrets) {
    if (v) {
      await setSecret(k, v, d);
      console.log(`  + secret ${k}`);
    }
  }

  console.log(`\nMigrasi selesai: ${count} server, ${secrets.filter((s) => s[1]).length} secret.`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migration gagal:", err.message);
    process.exit(1);
  });
