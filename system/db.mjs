import pkg from 'pg';
const { Pool } = pkg;
import { loadEnvFile } from 'node:process';
try { loadEnvFile(new URL('./.env', import.meta.url)); } catch (e) { if (e.code !== 'ENOENT') throw e; }

// DATABASE_SSL=disable para Postgres local sin SSL; DATABASE_SSL=verify para validar el certificado.
// Sin valor se mantiene el comportamiento anterior (SSL sin verificar certificado).
const sslMode = process.env.DATABASE_SSL || 'no-verify';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify' }
});

export async function checkDB() {
  const started = Date.now();
  await pool.query('SELECT 1');
  return Date.now() - started;
}

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT,
      client TEXT,
      notes TEXT,
      kind TEXT,
      local TEXT,
      start_date TEXT,
      reminder INTEGER,
      done BOOLEAN,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      text TEXT,
      department TEXT,
      agent TEXT,
      status TEXT,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sectors (
      id TEXT PRIMARY KEY,
      name TEXT,
      agent TEXT
    );
    CREATE TABLE IF NOT EXISTS inbox (
      id TEXT PRIMARY KEY,
      channel TEXT,
      sender TEXT,
      text TEXT,
      direction TEXT,
      status TEXT,
      timestamp BIGINT,
      received_at TEXT,
      provider_id TEXT,
      channel_id TEXT
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      request_id TEXT,
      text TEXT,
      reply TEXT,
      status TEXT,
      created_at TEXT,
      tasks JSONB
    );
  `);
}

export { pool };
