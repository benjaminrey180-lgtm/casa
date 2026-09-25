import {after} from 'node:test';
// Las pruebas vacían tablas: solo se permiten contra una base cuyo nombre contenga "test".
const url = process.env.DATABASE_URL || '';
let name = '';
try { name = new URL(url).pathname.slice(1); } catch {}
if (!/test/i.test(name)) {
 console.error('Define DATABASE_URL apuntando a una base de pruebas (su nombre debe contener "test"). Nunca uses la base real.');
 process.exit(1);
}
const {pool, initDB} = await import('../db.mjs');
await initDB();
const {initAuth} = await import('../auth.mjs');
await initAuth();
export async function resetDB() { await pool.query('TRUNCATE events, tasks, sectors, inbox, jobs, sessions, users'); }
after(() => pool.end());
export {pool};
