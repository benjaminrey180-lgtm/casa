import QRCode from 'qrcode';
import {pool} from './db.mjs';

// Tipos de acción de una placa. El administrador elige uno y pega la URL real del cliente.
export const ACTION_KINDS = {
 review: 'Dejar reseña en Google', instagram: 'Instagram', whatsapp: 'WhatsApp', menu: 'Ver menú',
 order: 'Hacer pedido', booking: 'Reservar hora', web: 'Página web', location: 'Ubicación',
 promo: 'Promoción', contact: 'Contacto', other: 'Otro'
};
const CODE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const bad = message => Object.assign(Error(message), {status: 400});

// Solo destinos seguros: nunca javascript:, data: ni similares.
export function safeURL(value) {
 let url;
 try { url = new URL(String(value).trim()); } catch { return null; }
 return ['https:', 'http:', 'tel:', 'mailto:'].includes(url.protocol) ? url.href : null;
}

export function validateTag(input) {
 const code = String(input?.code || '').trim().toLowerCase();
 if (!CODE.test(code)) throw bad('El código debe tener 3 a 40 caracteres: minúsculas, números y guiones.');
 const text = (v, max, name, required) => {
  const s = String(v ?? '').trim();
  if ((required && !s) || s.length > max) throw bad(`Revisa el campo ${name}.`);
  return s;
 };
 if (!Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > 8) throw bad('Agrega entre 1 y 8 acciones.');
 const ids = new Set();
 const actions = input.actions.map((a, i) => {
  if (!ACTION_KINDS[a?.kind]) throw bad(`Acción ${i + 1}: tipo inválido.`);
  const url = safeURL(a.url);
  if (!url) throw bad(`Acción ${i + 1}: la URL debe empezar con https://, http://, tel: o mailto:.`);
  let id = String(a.id || a.kind).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || a.kind;
  while (ids.has(id)) id += '-' + i;
  ids.add(id);
  return {id, kind: a.kind, label: text(a.label || ACTION_KINDS[a.kind], 40, `texto de la acción ${i + 1}`, true), url};
 });
 const redirect = input.redirect_action ? String(input.redirect_action) : null;
 if (redirect && !ids.has(redirect)) throw bad('La redirección directa debe apuntar a una de las acciones.');
 return {
  code, actions, redirect_action: redirect,
  client: text(input.client, 80, 'cliente', true),
  title: text(input.title, 80, 'título', true),
  subtitle: text(input.subtitle, 160, 'descripción', false),
  campaign: text(input.campaign, 40, 'campaña', false),
  active: input.active !== false
 };
}

// Clasificación aproximada; el user-agent no se guarda.
export function deviceOf(ua = '') {
 if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
 if (/Android/i.test(ua)) return 'android';
 if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
 return 'otro';
}
// Enlaces previsualizados por apps y buscadores: no cuentan como accesos.
const isBot = ua => /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|telegram/i.test(ua);

export async function listTags() {
 const {rows} = await pool.query(`
  SELECT t.*,
   count(e.*) FILTER (WHERE e.action='view' AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago')::int AS today,
   count(e.*) FILTER (WHERE e.action='view' AND e.created_at >= now() - interval '7 days')::int AS last7,
   count(e.*) FILTER (WHERE e.action='view' AND e.created_at >= now() - interval '30 days')::int AS last30,
   count(e.*) FILTER (WHERE e.action<>'view')::int AS clicks
  FROM nfc_tags t LEFT JOIN nfc_events e ON e.code=t.code
  GROUP BY t.code ORDER BY t.created_at DESC`);
 const {rows: byAction} = await pool.query(`SELECT code, action, count(*)::int AS n FROM nfc_events WHERE action<>'view' GROUP BY code, action`);
 const {rows: byDevice} = await pool.query(`SELECT code, device, count(*)::int AS n FROM nfc_events WHERE action='view' GROUP BY code, device`);
 return rows.map(t => ({...t,
  byAction: Object.fromEntries(byAction.filter(r => r.code === t.code).map(r => [r.action, r.n])),
  byDevice: Object.fromEntries(byDevice.filter(r => r.code === t.code).map(r => [r.device, r.n]))}));
}

export async function saveTag(input) {
 const t = validateTag(input);
 // original = código anterior cuando se renombra; sin él, crear falla si el código ya existe.
 const original = input.original ? String(input.original) : null;
 if (original) {
  const {rowCount} = await pool.query(`UPDATE nfc_tags SET code=$1, client=$2, title=$3, subtitle=$4, campaign=$5, actions=$6, redirect_action=$7, active=$8, updated_at=now() WHERE code=$9`,
   [t.code, t.client, t.title, t.subtitle, t.campaign, JSON.stringify(t.actions), t.redirect_action, t.active, original]).catch(e => { if (e.code === '23505') throw Object.assign(Error('Ya existe una placa con ese código.'), {status: 409}); throw e; });
  if (!rowCount) throw Object.assign(Error('Placa no encontrada.'), {status: 404});
 } else {
  await pool.query(`INSERT INTO nfc_tags (code, client, title, subtitle, campaign, actions, redirect_action, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
   [t.code, t.client, t.title, t.subtitle, t.campaign, JSON.stringify(t.actions), t.redirect_action, t.active]).catch(e => { if (e.code === '23505') throw Object.assign(Error('Ya existe una placa con ese código.'), {status: 409}); throw e; });
 }
 return t;
}

export async function setActive(code, active) {
 if (typeof active !== 'boolean') throw bad('Estado inválido.');
 const {rowCount} = await pool.query('UPDATE nfc_tags SET active=$1, updated_at=now() WHERE code=$2', [active, String(code)]);
 if (!rowCount) throw Object.assign(Error('Placa no encontrada.'), {status: 404});
 return {ok: true};
}

export async function qrSVG(publicBase, code) {
 return QRCode.toString(`${publicBase}/nfc/${encodeURIComponent(code)}`, {type: 'svg', errorCorrectionLevel: 'M', margin: 2});
}

async function record(tag, action, ua) {
 if (isBot(ua)) return;
 await pool.query('INSERT INTO nfc_events (code, action, device, campaign) VALUES ($1,$2,$3,$4)', [tag.code, action, deviceOf(ua), tag.campaign]);
 if (action === 'view') await pool.query('UPDATE nfc_tags SET visits=visits+1, last_access=now() WHERE code=$1', [tag.code]);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function page(title, body) {
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#101114"><title>${esc(title)}</title><style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#101114;color:#f7f7f8}*{box-sizing:border-box}
body{min-height:100svh;margin:0;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(ellipse at 50% 0%,#292633 0%,#101114 60%)}
main{width:min(100%,420px);padding:32px 22px 22px;border:1px solid #ffffff1c;border-radius:26px;background:#17181de8;text-align:center}
h1{margin:0;font-size:30px;letter-spacing:-.03em}p{margin:10px auto 24px;max-width:320px;color:#b9bac4;line-height:1.55}
nav{display:grid;gap:10px}a.b{display:block;padding:15px 18px;min-height:52px;border:1px solid #ffffff22;border-radius:14px;color:#fff;text-decoration:none;font-weight:650;font-size:16px;background:#ffffff0a}
a.b:first-child{background:#f5f5f5;color:#111;border-color:#f5f5f5}a.b:focus-visible{outline:3px solid #b9a4ff;outline-offset:2px}
footer{margin-top:22px;font-size:12px;color:#8a8c96}footer a{color:#b9bac4}
@media(hover:hover){a.b:hover{background:#ffffff16}a.b:first-child:hover{background:#fff}}
</style></head><body><main>${body}<footer>Desarrollado por <a href="https://iongroup.cl" rel="noopener">ION GROUP</a></footer></main></body></html>`;
}

// Rutas públicas /nfc/:code y /nfc/:code/a/:action. Devuelve true si atendió la petición.
export async function handlePublic(req, res, url) {
 const m = url.pathname.match(/^\/nfc\/([a-z0-9-]{3,40})(?:\/a\/([a-z0-9-]{1,40}))?\/?$/);
 if (!m || req.method !== 'GET') return false;
 const html = (code, body) => { res.writeHead(code, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}); res.end(body); };
 const {rows} = await pool.query('SELECT * FROM nfc_tags WHERE code=$1', [m[1]]);
 const tag = rows[0];
 if (!tag || !tag.active) { html(404, page('Placa no disponible', '<h1>Placa no disponible</h1><p>Esta placa no está activa. Consulta directamente con el negocio.</p>')); return true; }
 const ua = String(req.headers['user-agent'] || '');
 const go = action => { res.writeHead(302, {Location: action.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}); res.end(); };
 if (m[2]) {
  const action = tag.actions.find(a => a.id === m[2]);
  if (!action) { html(404, page('No encontrado', '<h1>Opción no encontrada</h1>')); return true; }
  await record(tag, action.id, ua); go(action); return true;
 }
 await record(tag, 'view', ua);
 const direct = tag.redirect_action && tag.actions.find(a => a.id === tag.redirect_action);
 if (direct) { await record(tag, direct.id, ua); go(direct); return true; }
 const buttons = tag.actions.map(a => `<a class="b" href="/nfc/${esc(tag.code)}/a/${esc(a.id)}" rel="noopener">${esc(a.label)}</a>`).join('');
 html(200, page(tag.title, `<h1>${esc(tag.title)}</h1>${tag.subtitle ? `<p>${esc(tag.subtitle)}</p>` : '<p></p>'}<nav aria-label="Opciones de ${esc(tag.title)}">${buttons}</nav>`));
 return true;
}
