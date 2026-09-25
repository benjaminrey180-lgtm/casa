import {randomUUID} from 'node:crypto';
import {pool} from './db.mjs';

export const CATEGORIES = {restaurante: 'Comida / restaurante', barberia: 'Barbería / peluquería', comercio: 'Comercio / supermercado', servicios: 'Servicios', administracion: 'Administración', otro: 'Otro'};
export const STATUSES = {activo: 'En producción', desarrollo: 'En desarrollo', pausado: 'Pausado', terminado: 'Terminado'};
export const MODULES = ['ventas', 'caja', 'inventario', 'reservas', 'pedidos', 'delivery', 'reportes', 'usuarios', 'web', 'nfc', 'ia'];
const bad = message => Object.assign(Error(message), {status: 400});

export const normalize = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

export function validateClient(input) {
 const text = (v, max, name, required = false) => { const s = String(v ?? '').trim(); if ((required && !s) || s.length > max) throw bad(`Revisa el campo ${name}.`); return s; };
 const name = text(input?.name, 80, 'nombre', true);
 const slug = (text(input.slug, 60, 'identificador') || normalize(name).replace(/ /g, '-')).toLowerCase();
 if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug)) throw bad('El identificador solo admite minúsculas, números y guiones.');
 const category = CATEGORIES[input.category] ? input.category : 'otro';
 const status = STATUSES[input.status] ? input.status : 'desarrollo';
 const domain = text(input.domain, 120, 'dominio').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
 if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw bad('Dominio inválido (ej. duo.iongroup.cl).');
 const health = text(input.health_url, 200, 'URL de salud');
 if (health && !/^https?:\/\//.test(health)) throw bad('La URL de salud debe empezar con https://');
 const start = input.start_date ? String(input.start_date) : null;
 if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw bad('Fecha de inicio inválida.');
 const fee = input.monthly_fee === '' || input.monthly_fee == null ? null : Number(input.monthly_fee);
 if (fee !== null && (!Number.isInteger(fee) || fee < 0 || fee > 100000000)) throw bad('Mensualidad inválida (pesos, sin decimales).');
 const modules = Array.isArray(input.modules) ? [...new Set(input.modules.filter(m => MODULES.includes(m)))] : [];
 return {slug, name, category, status, domain, health_url: health, start_date: start, monthly_fee: fee, modules,
  company: text(input.company, 120, 'empresa'), city: text(input.city, 80, 'ciudad'), system: text(input.system, 120, 'sistema'),
  services: text(input.services, 500, 'servicios'), contact: text(input.contact, 200, 'contacto'), notes: text(input.notes, 2000, 'notas'),
  public_portfolio: input.public_portfolio === true};
}

export async function listClients() {
 const {rows} = await pool.query('SELECT * FROM clients ORDER BY status, name');
 return rows;
}

export async function saveClient(input) {
 const c = validateClient(input);
 const cols = ['slug', 'name', 'company', 'category', 'city', 'system', 'domain', 'health_url', 'status', 'start_date', 'monthly_fee', 'services', 'contact', 'notes', 'modules', 'public_portfolio'];
 const values = cols.map(k => k === 'modules' ? JSON.stringify(c[k]) : c[k]);
 const dup = e => { if (e.code === '23505') throw Object.assign(Error('Ya existe un cliente con ese identificador.'), {status: 409}); throw e; };
 if (input.id) {
  const {rowCount} = await pool.query(`UPDATE clients SET ${cols.map((k, i) => `${k}=$${i + 1}`).join(', ')}, updated_at=now() WHERE id=$${cols.length + 1}`, [...values, String(input.id)]).catch(dup);
  if (!rowCount) throw Object.assign(Error('Cliente no encontrado.'), {status: 404});
  return {id: input.id, ...c};
 }
 const id = randomUUID();
 await pool.query(`INSERT INTO clients (id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})`, [id, ...values]).catch(dup);
 return {id, ...c};
}

// Estado online: GET a health_url o al dominio. Solo http(s); el resultado queda guardado para el panel.
export async function checkClients({fetcher = fetch, timeout = 8000} = {}) {
 const {rows} = await pool.query("SELECT id, domain, health_url FROM clients WHERE status<>'terminado' AND (domain<>'' OR health_url<>'')");
 await Promise.all(rows.map(async c => {
  const target = c.health_url || `https://${c.domain}/`;
  const started = Date.now();
  let ok = false, detail;
  try {
   const r = await fetcher(target, {redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: {'User-Agent': 'ION-Monitor/1.0'}});
   ok = r.status < 500; detail = `HTTP ${r.status}`;
  } catch (e) { detail = e.cause?.code || e.name || 'Error de conexión'; }
  await pool.query('UPDATE clients SET last_check_at=now(), last_check_ok=$1, last_check_ms=$2, last_check_detail=$3 WHERE id=$4', [ok, Date.now() - started, detail.slice(0, 120), c.id]);
 }));
 return {checked: rows.length};
}

// Búsqueda tolerante: sin tildes ni mayúsculas, palabras parciales, sinónimos y errores pequeños.
const SYNONYMS = {
 restaurant: ['restaurante'], restaurante: ['restaurante'], restoran: ['restaurante'], comida: ['restaurante'], bowls: ['restaurante'], burritos: ['restaurante'], sushi: ['restaurante'], pedidos: ['pedidos'], delivery: ['delivery'],
 barberia: ['barberia'], barber: ['barberia'], barbero: ['barberia'], peluqueria: ['barberia'], corte: ['barberia'],
 reservar: ['reservas'], reserva: ['reservas'], reservas: ['reservas'], agenda: ['reservas'], hora: ['reservas'],
 supermercado: ['comercio'], minimarket: ['comercio'], tienda: ['comercio'], caja: ['caja'], inventario: ['inventario'], stock: ['inventario']
};
function distance(a, b) {
 if (Math.abs(a.length - b.length) > 2) return 3;
 let prev = Array.from({length: b.length + 1}, (_, i) => i);
 for (let i = 1; i <= a.length; i++) {
  const cur = [i];
  for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  prev = cur;
 }
 return prev[b.length];
}
function termScore(term, words, tags) {
 if (tags.has(term) || (SYNONYMS[term] || []).some(t => tags.has(t))) return 3;
 let best = 0;
 for (const w of words) {
  if (w === term) return 3;
  if (w.startsWith(term) && term.length >= 2) best = Math.max(best, 2.5);
  else if (term.length >= 4 && w.includes(term)) best = Math.max(best, 2);
  else if (term.length >= 4 && distance(term, w) <= (term.length >= 7 ? 2 : 1)) best = Math.max(best, 1.5);
 }
 for (const syn of Object.keys(SYNONYMS)) if (term.length >= 4 && distance(term, syn) <= 1 && SYNONYMS[syn].some(t => tags.has(t))) best = Math.max(best, 1.5);
 return best;
}
export function searchItems(items, query, limit = 12) {
 const terms = normalize(query).split(' ').filter(Boolean);
 if (!terms.length) return [];
 return items.map(item => {
  const words = normalize(item.text).split(' ');
  const tags = new Set(item.tags);
  let score = 0;
  for (const t of terms) { const s = termScore(t, words, tags); if (!s) return null; score += s; }
  return {...item, score};
 }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit).map(({text, tags, ...r}) => r);
}

export async function search(query) {
 const [clients, {rows: tags}] = await Promise.all([listClients(), pool.query('SELECT code, client, title, campaign, actions FROM nfc_tags')]);
 const items = [
  ...clients.map(c => ({type: 'cliente', id: c.id, title: c.name, subtitle: [CATEGORIES[c.category], c.city, STATUSES[c.status]].filter(Boolean).join(' · '),
   text: [c.name, c.company, c.slug, c.city, c.system, c.domain, c.services, CATEGORIES[c.category]].join(' '), tags: [c.category, ...c.modules]})),
  ...tags.map(t => ({type: 'placa', id: t.code, title: `${t.title} · /nfc/${t.code}`, subtitle: `Placa NFC de ${t.client}`,
   text: [t.code, t.client, t.title, t.campaign, ...t.actions.map(a => a.label)].join(' '), tags: t.actions.some(a => a.kind === 'booking') ? ['reservas'] : []}))
 ];
 return searchItems(items, query);
}
