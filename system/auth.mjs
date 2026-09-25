import {randomBytes,scrypt as scryptCb,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {pool} from './db.mjs';

const scrypt = promisify(scryptCb);
export const ROLES = ['SUPERADMIN', 'ADMIN_CLIENTE', 'TRABAJADOR', 'USUARIO'];
// Roles con acceso al panel interno de ION Group. ADMIN_CLIENTE y USUARIO quedan para los sistemas de clientes.
export const PANEL_ROLES = ['SUPERADMIN', 'TRABAJADOR'];
const SESSION_DAYS = 7;
const COOKIE = 'ion_session', SECURE_COOKIE = '__Host-ion_session';

// Las tablas se crean con migrations/002_auth.sql; se conserva por compatibilidad.
export async function initAuth() {}

export async function hashPassword(password) {
 const salt = randomBytes(16);
 const key = await scrypt(password, salt, 64);
 return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
 const [kind, salt, hash] = String(stored).split('$');
 if (kind !== 'scrypt' || !salt || !hash) return false;
 const key = await scrypt(password, Buffer.from(salt, 'hex'), 64);
 const expected = Buffer.from(hash, 'hex');
 return expected.length === key.length && timingSafeEqual(expected, key);
}

export function validatePassword(password) {
 if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw Object.assign(Error('La contraseña debe tener entre 12 y 200 caracteres.'), {status: 400});
}

export async function createUser({email, name, password, role, tenant = null}) {
 email = String(email || '').trim().toLowerCase();
 if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw Object.assign(Error('Correo inválido.'), {status: 400});
 if (typeof name !== 'string' || !name.trim() || name.length > 120) throw Object.assign(Error('Nombre inválido.'), {status: 400});
 if (!ROLES.includes(role)) throw Object.assign(Error('Rol inválido.'), {status: 400});
 validatePassword(password);
 const user = {id: randomUUID(), email, name: name.trim(), role, tenant};
 try {
  await pool.query('INSERT INTO users (id,email,name,password_hash,role,tenant) VALUES ($1,$2,$3,$4,$5,$6)', [user.id, email, user.name, await hashPassword(password), role, tenant]);
 } catch (e) {
  if (e.code === '23505') throw Object.assign(Error('Ya existe un usuario con ese correo.'), {status: 409});
  throw e;
 }
 return user;
}

export async function userCount() {
 const {rows} = await pool.query('SELECT count(*)::int AS n FROM users WHERE active');
 return rows[0].n;
}

const tokenHash = token => createHash('sha256').update(token).digest('hex');

// Límites en memoria (ventana de 15 minutos):
// - 10 fallos por IP+correo: un atacante solo se bloquea a sí mismo, no al dueño de la cuenta.
// - 50 fallos por IP en total: frena la prueba masiva de correos desde una misma IP.
const failures = new Map();
const WINDOW = 15 * 60 * 1000, MAX_PER_ACCOUNT = 10, MAX_PER_IP = 50;
function count(key) {
 const entry = failures.get(key);
 return entry && Date.now() - entry.first <= WINDOW ? entry.count : 0;
}
function fail(key) {
 const now = Date.now(), entry = failures.get(key);
 if (!entry || now - entry.first > WINDOW) failures.set(key, {first: now, count: 1});
 else entry.count++;
 if (failures.size > 10000) for (const [k, v] of failures) if (now - v.first > WINDOW) failures.delete(k);
}

// IP del cliente. Detrás de Caddy la conexión viene de 127.0.0.1: solo entonces, y con TRUST_PROXY=1,
// se usa el último valor de X-Forwarded-For (el que agregó nuestro propio proxy).
export function clientIP(req) {
 const remote = String(req.socket?.remoteAddress || '');
 const loopback = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
 if (loopback && process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',').pop().trim();
 return remote;
}

// Hash de referencia para que un correo inexistente tarde lo mismo que una contraseña incorrecta.
const dummyHash = hashPassword(randomBytes(16).toString('hex'));

export async function login({email, password}, ip) {
 email = String(email || '').trim().toLowerCase();
 const key = `${ip}|${email}`, ipKey = `ip|${ip}`;
 if (count(key) >= MAX_PER_ACCOUNT || count(ipKey) >= MAX_PER_IP) throw Object.assign(Error('Demasiados intentos. Espera 15 minutos.'), {status: 429});
 const {rows} = await pool.query('SELECT * FROM users WHERE email=$1 AND active', [email]);
 const user = rows[0];
 const ok = await verifyPassword(String(password || ''), user ? user.password_hash : await dummyHash);
 if (!user || !ok) { fail(key); fail(ipKey); throw Object.assign(Error('Correo o contraseña incorrectos.'), {status: 401}); }
 failures.delete(key);
 const token = randomBytes(32).toString('base64url');
 const expires = new Date(Date.now() + SESSION_DAYS * 86400000);
 await pool.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [tokenHash(token), user.id, expires]);
 await pool.query('DELETE FROM sessions WHERE expires_at < now()');
 return {token, expires, user: publicUser(user)};
}

export async function logout(token) {
 if (token) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
}

export async function sessionUser(token) {
 if (!token || token.length > 100) return null;
 const {rows} = await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active', [tokenHash(token)]);
 return rows[0] ? publicUser(rows[0]) : null;
}

const publicUser = u => ({id: u.id, email: u.email, name: u.name, role: u.role, tenant: u.tenant});

export function readCookie(req) {
 for (const part of String(req.headers.cookie || '').split(';')) {
  const [k, ...v] = part.trim().split('=');
  if (k === SECURE_COOKIE || k === COOKIE) return v.join('=');
 }
 return null;
}

export function sessionCookie(token, expires, secure) {
 const attrs = [`${secure ? SECURE_COOKIE : COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict'];
 if (expires) attrs.push(`Expires=${expires.toUTCString()}`); else attrs.push('Max-Age=0');
 if (secure) attrs.push('Secure');
 return attrs.join('; ');
}

// Host local real (no el que dice un proxy): solo entonces se permite el modo sin usuarios.
export function isLocalHost(req) {
 const host = String(req.headers.host || '').replace(/:\d+$/, '');
 return (host === '127.0.0.1' || host === 'localhost') && !req.headers['x-forwarded-for'] && !req.headers['x-forwarded-host'];
}

export async function purgeSessions() {
 await pool.query('DELETE FROM sessions WHERE expires_at < now()');
}
