import pkg from 'pg';
const { Pool } = pkg;
import { loadEnvFile } from 'node:process';
import { readdir, readFile } from 'node:fs/promises';
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

// Migraciones versionadas en migrations/NNN_nombre.sql. Cada una corre una vez, dentro de una
// transacción, y queda registrada en schema_migrations. Solo se permiten cambios aditivos.
export async function initDB() {
  const client = await pool.connect();
  try {
    // Evita que dos procesos migren a la vez.
    await client.query('SELECT pg_advisory_lock(4310)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const {rows} = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map(r => r.name));
    const dir = new URL('./migrations/', import.meta.url);
    for (const name of (await readdir(dir)).filter(f => /^\d{3}_[\w-]+\.sql$/.test(f)).sort()) {
      if (done.has(name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(await readFile(new URL(name, dir), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log('Migración aplicada:', name);
      } catch (e) {
        await client.query('ROLLBACK');
        e.message = `Migración ${name} falló: ${e.message}`;
        throw e;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(4310)').catch(() => {});
    client.release();
  }
}

export { pool };
