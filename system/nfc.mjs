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
const isBot = ua => !ua || /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|telegram|curl|wget|python|headless|go-http|java\/|okhttp|axios|node-fetch|libwww|httpclient/i.test(ua);

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
 // El código es la URL grabada en las placas físicas: cambiarlo las dejaría en 404.
 if (original && original !== t.code) throw bad('El código no se puede cambiar: las placas ya grabadas apuntan a él. Crea una placa nueva si necesitas otra URL.');
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
 return QRCode.toString(`${publicBase}/${encodeURIComponent(code)}`, {type: 'svg', errorCorrectionLevel: 'M', margin: 2});
}

async function record(tag, action, ua) {
 if (isBot(ua)) return;
 await pool.query('INSERT INTO nfc_events (code, action, device, campaign) VALUES ($1,$2,$3,$4)', [tag.code, action, deviceOf(ua), tag.campaign]);
 if (action === 'view') await pool.query('UPDATE nfc_tags SET visits=visits+1, last_access=now() WHERE code=$1', [tag.code]);
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// Datos públicos de la tarjeta de ION GROUP (los mismos de iongroup.cl).
export const ION_CARD = {
 name: 'ION GROUP SpA', short: 'ION GROUP', tagline: 'Sistemas y desarrollo de software a medida',
 description: 'Software, sistemas, NFC y QR para que tu negocio funcione mejor.',
 phone: '+56921745933', phoneLabel: '+56 9 2174 5933', email: 'iongroupspa@gmail.com',
 web: 'https://iongroup.cl', instagram: 'https://www.instagram.com/iongroup.cl/', igLabel: '@iongroup.cl'
};

const ICONS = {
 whatsapp: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Zm4.6 12.6c-.2.6-1.1 1.1-1.6 1.2-.4.1-.9.1-1.5-.1a13 13 0 0 1-5.2-4.6 5.4 5.4 0 0 1-1.1-2.8c0-1.3.7-2 1-2.3.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.3 0 .5l-.4.6c-.1.1-.2.3-.1.5.3.5 1.3 2 2.9 2.7.2.1.4.1.5-.1l.7-.8c.2-.2.3-.2.5-.1l1.8.9c.3.1.4.2.4.3 0 .1 0 .6-.2 1.2Z"/>',
 phone: '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/>',
 mail: '<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm8 7 7.5-5H4.5L12 12Zm0 2-8-5.3V17h16V8.7L12 14Z"/>',
 instagram: '<path d="M7.5 3h9A4.5 4.5 0 0 1 21 7.5v9a4.5 4.5 0 0 1-4.5 4.5h-9A4.5 4.5 0 0 1 3 16.5v-9A4.5 4.5 0 0 1 7.5 3Zm0 2A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 16.5 5h-9ZM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm4.8-3.3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>',
 web: '<path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm2.9 10H9.1c.3 2.3 1.4 4.6 2.9 5.9 1.5-1.3 2.6-3.6 2.9-5.9Zm-7.8 0H5.1a7 7 0 0 0 4.3 5.5A13 13 0 0 1 7.1 13Zm11.8 0h-2a13 13 0 0 1-2.3 5.5 7 7 0 0 0 4.3-5.5ZM9.4 5.5A7 7 0 0 0 5.1 11h2a13 13 0 0 1 2.3-5.5ZM12 5.1C10.5 6.4 9.4 8.7 9.1 11h5.8c-.3-2.3-1.4-4.6-2.9-5.9Zm2.6.4a13 13 0 0 1 2.3 5.5h2a7 7 0 0 0-4.3-5.5Z"/>',
 save: '<path d="M12 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0 2c4.4 0 8 1.8 8 4v2H4v-2c0-2.2 3.6-4 8-4Zm7-9h2v2h2v2h-2v2h-2V9h-2V7h2V5Z"/>',
 generic: '<path d="M10 17l5-5-5-5v10Z"/>'
};
const KIND_ICON = {review: 'generic', instagram: 'instagram', whatsapp: 'whatsapp', menu: 'generic', order: 'whatsapp', booking: 'generic', web: 'web', location: 'generic', promo: 'generic', contact: 'phone', other: 'generic'};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.generic}</svg>`;

// Plantilla común animada. Todo en línea (sin JS) y respeta prefers-reduced-motion.
function page(title, body, {description = '', logo = false} = {}) {
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#0d0c14"><title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}">` : ''}<style>
:root{color-scheme:dark;--a:#8c73f2;--b:#39d0c3;--bg:#0d0c14;--card:#16151fe6;--line:#ffffff1f;--txt:#f6f5fb;--mut:#b9b7c9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;min-height:100svh;display:grid;place-items:center;padding:28px 16px;background:var(--bg);color:var(--txt);overflow-x:hidden}
.bg{position:fixed;inset:-20%;z-index:-1;background:radial-gradient(40% 35% at 20% 20%,#8c73f255,transparent 70%),radial-gradient(35% 30% at 80% 30%,#39d0c340,transparent 70%),radial-gradient(45% 40% at 50% 90%,#5b3fd644,transparent 70%);filter:blur(10px)}
main{width:min(100%,420px);padding:34px 22px 22px;border:1px solid var(--line);border-radius:28px;background:var(--card);backdrop-filter:blur(14px);box-shadow:0 30px 80px #0009;text-align:center;position:relative;overflow:hidden}
main::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(130deg,#8c73f2aa,transparent 35%,transparent 65%,#39d0c3aa);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
.logo-wrap{position:relative;width:max-content;margin:0 auto 20px;display:grid;place-items:center}
.logo-wrap img{width:220px;height:69px;object-fit:cover;border-radius:18px;background:#000;border:1px solid var(--line);position:relative;z-index:1;display:block}
.ring{position:absolute;inset:-6px;border-radius:24px;border:2px solid var(--a);opacity:0}
.mono{width:96px;height:96px;border-radius:24px;display:grid;place-items:center;font-size:38px;font-weight:800;background:linear-gradient(140deg,var(--a),var(--b));color:#0d0c14;position:relative;z-index:1}
.eyebrow{margin:0 0 8px;color:#c9bcff;font-size:11px;font-weight:750;letter-spacing:.2em}
h1{margin:0;font-size:clamp(28px,8vw,34px);letter-spacing:-.03em;line-height:1.1}
.sub{margin:12px auto 24px;max-width:320px;color:var(--mut);line-height:1.55}
nav{display:grid;gap:10px}
a.b{display:flex;align-items:center;gap:12px;padding:14px 16px;min-height:54px;border:1px solid var(--line);border-radius:16px;color:var(--txt);text-decoration:none;font-weight:650;font-size:16px;background:#ffffff08;text-align:left;position:relative;overflow:hidden}
a.b svg{width:22px;height:22px;flex:none;fill:currentColor;opacity:.9}
a.b span{flex:1}a.b small{color:var(--mut);font-weight:500;font-size:13px}
a.b.primary{background:linear-gradient(120deg,var(--a),#6f55e6);border-color:transparent;color:#fff}a.b.primary small{color:#ffffffd9}
a.b.primary::after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,#ffffff55,transparent);transform:skewX(-20deg)}
a.b:focus-visible{outline:3px solid var(--b);outline-offset:2px}
footer{margin-top:22px;font-size:12px;color:#8e8ba3}footer a{color:var(--mut)}
@media(hover:hover){a.b{transition:transform .2s,background .2s,border-color .2s}a.b:hover{transform:translateY(-2px);background:#ffffff12;border-color:#ffffff38}a.b.primary:hover{background:linear-gradient(120deg,#9a85ff,#7a60f0)}}
@media(prefers-reduced-motion:no-preference){
 .bg{animation:drift 18s ease-in-out infinite alternate}
 main{animation:rise .7s cubic-bezier(.2,.8,.2,1) both}
 .logo-wrap img,.mono{animation:pop .8s .15s cubic-bezier(.2,.9,.3,1.3) both}
 .ring{animation:pulse 2.8s 1s ease-out infinite}
 .eyebrow,h1,.sub{animation:fade .6s both}.eyebrow{animation-delay:.3s}h1{animation-delay:.38s}.sub{animation-delay:.46s}
 nav a.b{animation:fade .5s both}${Array.from({length: 8}, (_, i) => `nav a.b:nth-child(${i + 1}){animation-delay:${(0.55 + i * 0.07).toFixed(2)}s}`).join('')}
 a.b.primary::after{animation:shine 3.2s 1.6s ease-in-out infinite}
}
@keyframes drift{to{transform:translate(4%,-3%) rotate(8deg) scale(1.05)}}
@keyframes rise{from{opacity:0;transform:translateY(24px) scale(.98)}}
@keyframes pop{from{opacity:0;transform:scale(.6) rotate(-8deg)}}
@keyframes pulse{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(1.35)}}
@keyframes fade{from{opacity:0;transform:translateY(12px)}}
@keyframes shine{0%,60%{left:-60%}100%{left:130%}}
</style></head><body><div class="bg" aria-hidden="true"></div><main>${body}<footer>${logo ? '© ION GROUP SpA' : 'Desarrollado por <a href="https://iongroup.cl" rel="noopener">ION GROUP</a>'}</footer></main></body></html>`;
}

// Tarjeta de presentación de ION GROUP (raíz de nfc.iongroup.cl).
export function ionCardPage() {
 const c = ION_CARD;
 const wa = `https://wa.me/${c.phone.replace('+', '')}?text=${encodeURIComponent('Hola ION GROUP, vi su tarjeta y quiero conversar sobre un sistema para mi negocio.')}`;
 const links = [
  ['primary', wa, 'whatsapp', 'Escríbenos por WhatsApp', c.phoneLabel],
  ['', '/contacto.vcf', 'save', 'Guardar contacto', 'Agrega ION GROUP a tu teléfono'],
  ['', c.web, 'web', 'Visitar iongroup.cl', 'Servicios y cotización'],
  ['', c.instagram, 'instagram', 'Instagram', c.igLabel],
  ['', `mailto:${c.email}`, 'mail', 'Correo', c.email],
  ['', `tel:${c.phone}`, 'phone', 'Llamar', c.phoneLabel]
 ].map(([cls, href, ic, label, small]) => `<a class="b ${cls}" href="${esc(href)}"${href.startsWith('http') ? ' rel="noopener"' : ''}>${icon(ic)}<span>${esc(label)}<br><small>${esc(small)}</small></span></a>`).join('');
 return page(`${c.short} · Tarjeta digital`, `<div class="logo-wrap"><span class="ring" aria-hidden="true"></span><img src="/logo.webp" alt="Logo de ION GROUP" width="220" height="69"></div><p class="eyebrow">TARJETA DIGITAL · NFC</p><h1>${esc(c.short)}</h1><p class="sub">${esc(c.tagline)}. ${esc(c.description)}</p><nav aria-label="Contacto de ION GROUP">${links}</nav>`, {description: `${c.short}: ${c.tagline}.`, logo: true});
}

// vCard 3.0: el visitante guarda a ION GROUP en sus contactos con un toque.
export function ionVCard() {
 const c = ION_CARD;
 return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${c.name}`, `ORG:${c.name}`, `TITLE:${c.tagline}`, `TEL;TYPE=CELL,VOICE:${c.phone}`, `EMAIL;TYPE=INTERNET:${c.email}`, `URL:${c.web}`, `X-SOCIALPROFILE;TYPE=instagram:${c.instagram}`, 'END:VCARD'].join('\r\n') + '\r\n';
}

const NFC_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'";

// Rutas públicas. En nfc.iongroup.cl: "/" tarjeta de ION, "/contacto.vcf", "/logo.webp", "/[código]" y
// "/[código]/a/[acción]". En cualquier host se mantiene /nfc/[código] por compatibilidad.
export async function handlePublic(req, res, url, {nfcHost = false, logoFile = null} = {}) {
 if (req.method !== 'GET' && req.method !== 'HEAD') return false;
 const html = (code, body) => { res.writeHead(code, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': NFC_CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'}); res.end(body); };
 if (nfcHost) {
  if (url.pathname === '/') { html(200, ionCardPage()); return true; }
  if (url.pathname === '/contacto.vcf') { res.writeHead(200, {'Content-Type': 'text/vcard; charset=utf-8', 'Content-Disposition': 'attachment; filename="ION-GROUP.vcf"', 'Cache-Control': 'public, max-age=3600'}); res.end(ionVCard()); return true; }
  if (url.pathname === '/favicon.ico') { res.writeHead(204, {'Cache-Control': 'public, max-age=86400'}); res.end(); return true; }
  if (url.pathname === '/logo.webp' && logoFile) { res.writeHead(200, {'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400'}); res.end(await logoFile()); return true; }
 }
 const m = url.pathname.match(nfcHost ? /^\/(?:nfc\/)?([a-z0-9-]{3,40})(?:\/a\/([a-z0-9-]{1,40}))?\/?$/ : /^\/nfc\/([a-z0-9-]{3,40})(?:\/a\/([a-z0-9-]{1,40}))?\/?$/);
 if (!m) { if (nfcHost) { html(404, page('No encontrado', '<h1>Página no encontrada</h1><p class="sub">Revisa el enlace o visita <a href="https://iongroup.cl">iongroup.cl</a>.</p>')); return true; } return false; }
 const base = nfcHost ? '' : '/nfc';
 const {rows} = await pool.query('SELECT * FROM nfc_tags WHERE code=$1', [m[1]]);
 const tag = rows[0];
 if (!tag || !tag.active) { html(404, page('Placa no disponible', '<h1>Placa no disponible</h1><p class="sub">Esta placa no está activa. Consulta directamente con el negocio.</p>')); return true; }
 const ua = String(req.headers['user-agent'] || '');
 const go = action => { res.writeHead(302, {Location: action.url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}); res.end(); };
 if (m[2]) {
  const action = tag.actions.find(a => a.id === m[2]);
  if (!action) { html(404, page('No encontrado', '<h1>Opción no encontrada</h1>')); return true; }
  await record(tag, action.id, ua); go(action); return true;
 }
 await record(tag, 'view', ua);
 const direct = tag.redirect_action && tag.actions.find(a => a.id === tag.redirect_action);
 // Redirección directa: se cuenta la vista; no se suma un clic que el usuario no hizo.
 if (direct) { go(direct); return true; }
 const initial = esc([...tag.title.trim()][0]?.toUpperCase() || '•');
 const buttons = tag.actions.map((a, i) => `<a class="b${i === 0 ? ' primary' : ''}" href="${base}/${esc(tag.code)}/a/${esc(a.id)}" rel="noopener">${icon(KIND_ICON[a.kind])}<span>${esc(a.label)}</span></a>`).join('');
 html(200, page(tag.title, `<div class="logo-wrap"><span class="ring" aria-hidden="true"></span><div class="mono" aria-hidden="true">${initial}</div></div><h1>${esc(tag.title)}</h1><p class="sub">${esc(tag.subtitle || '')}</p><nav aria-label="Opciones de ${esc(tag.title)}">${buttons}</nav>`));
 return true;
}
