// Cartera de clientes (panel central) y búsqueda global tolerante a errores.
(() => {
 const byId = id => document.getElementById(id);
 const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
 const clp = n => n == null ? '—' : new Intl.NumberFormat('es-CL', {style: 'currency', currency: 'CLP', maximumFractionDigits: 0}).format(n);
 let state = {clients: [], categories: {}, statuses: {}, modules: []}, editing = null;

 async function load() {
  const r = await fetch('/api/clients'); if (!r.ok) return;
  state = await r.json(); render();
 }
 const stat = (label, value) => { const b = el('div', null, 'nfc-stat'); b.append(el('b', String(value)), el('span', label)); return b; };
 function health(c) {
  if (!c.domain && !c.health_url) return el('span', 'Sin dominio', 'badge');
  if (c.last_check_ok == null) return el('span', '○ Sin comprobar', 'badge');
  const b = el('span', c.last_check_ok ? `● En línea · ${c.last_check_ms} ms` : `● Sin respuesta · ${c.last_check_detail}`, 'badge ' + (c.last_check_ok ? 'ok' : 'down'));
  b.title = `Comprobado ${new Date(c.last_check_at).toLocaleString('es-CL', {timeZone: 'America/Santiago'})}`;
  return b;
 }
 function render() {
  const active = state.clients.filter(c => c.status === 'activo');
  const down = state.clients.filter(c => c.last_check_ok === false && c.status !== 'terminado');
  byId('clientsSummary').replaceChildren(stat('Clientes', state.clients.length), stat('En producción', active.length), stat('Con problemas', down.length), stat('Mensualidades activas', clp(active.reduce((n, c) => n + (c.monthly_fee || 0), 0))));
  const list = byId('clientsList');
  if (!state.clients.length) { list.replaceChildren(el('p', 'Aún no hay clientes registrados. Agrega el primero con “+ Nuevo cliente”.', 'panel')); return; }
  list.replaceChildren(...state.clients.map(c => {
   const card = el('article', null, 'nfc-card panel' + (c.last_check_ok === false ? ' is-down' : ''));
   card.id = 'client-' + c.id;
   const head = el('div', null, 'nfc-head'); const t = el('div');
   t.append(el('h3', c.name), el('small', [state.categories[c.category], c.city, state.statuses[c.status]].filter(Boolean).join(' · ')));
   head.append(t, health(c));
   const info = el('ul', null, 'nfc-detail');
   for (const [k, v] of [['Sistema', c.system], ['Dominio', c.domain], ['Inicio', c.start_date && new Date(c.start_date).toLocaleDateString('es-CL', {timeZone: 'UTC'})], ['Mensualidad', c.monthly_fee != null && clp(c.monthly_fee)], ['Módulos', c.modules.join(', ')], ['Contacto', c.contact], ['Portafolio público', c.public_portfolio ? 'autorizado' : '']]) if (v) info.append(el('li', `${k}: ${v}`));
   const tools = el('div', null, 'nfc-tools');
   const edit = el('button', 'Editar', 'secondary'); edit.type = 'button'; edit.onclick = () => open(c); tools.append(edit);
   if (c.domain) { const a = el('a', 'Abrir sitio', 'secondary'); a.href = `https://${c.domain}`; a.target = '_blank'; a.rel = 'noopener'; tools.append(a); }
   card.append(head, info);
   if (c.notes) card.append(el('p', c.notes, 'subtle client-notes'));
   card.append(tools);
   return card;
  }));
 }
 function open(c) {
  editing = c ? c.id : null;
  byId('clientDialogTitle').textContent = c ? 'Editar cliente' : 'Nuevo cliente';
  byId('clientForm').reset();
  const fill = (id, map) => byId(id).replaceChildren(...Object.entries(map).map(([k, v]) => { const o = el('option', v); o.value = k; return o; }));
  fill('clCategory', state.categories); fill('clStatus', state.statuses);
  byId('clModules').replaceChildren(...state.modules.map(m => { const l = el('label', null, 'check'); const i = el('input'); i.type = 'checkbox'; i.value = m; i.checked = !!c?.modules.includes(m); l.append(i, document.createTextNode(' ' + m)); return l; }));
  const v = (id, val) => byId(id).value = val ?? '';
  v('clName', c?.name); v('clCompany', c?.company); v('clCategory', c?.category || 'otro'); v('clStatus', c?.status || 'desarrollo'); v('clCity', c?.city);
  v('clStart', c?.start_date ? String(c.start_date).slice(0, 10) : ''); v('clSystem', c?.system); v('clDomain', c?.domain); v('clFee', c?.monthly_fee);
  v('clHealth', c?.health_url); v('clServices', c?.services); v('clContact', c?.contact); v('clNotes', c?.notes); byId('clPortfolio').checked = !!c?.public_portfolio;
  byId('clientDialog').showModal();
 }
 byId('clientNew').onclick = () => open(null);
 byId('clientsCheck').onclick = async e => {
  const b = e.target; b.disabled = true; b.textContent = 'Comprobando…';
  try { const r = await fetch('/api/clients/check', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}); const d = await r.json(); if (!r.ok) throw Error(d.error); await load(); notify(`Estado comprobado en ${d.checked} sistemas.`); }
  catch (err) { notify(err.message); } finally { b.disabled = false; b.textContent = 'Comprobar estado'; }
 };
 byId('clientForm').onsubmit = async e => {
  e.preventDefault(); const b = e.submitter; b.disabled = true;
  try {
   const body = {id: editing, name: byId('clName').value, company: byId('clCompany').value, category: byId('clCategory').value, status: byId('clStatus').value, city: byId('clCity').value,
    start_date: byId('clStart').value || null, system: byId('clSystem').value, domain: byId('clDomain').value, monthly_fee: byId('clFee').value === '' ? null : Number(byId('clFee').value),
    health_url: byId('clHealth').value, services: byId('clServices').value, contact: byId('clContact').value, notes: byId('clNotes').value, public_portfolio: byId('clPortfolio').checked,
    modules: [...byId('clModules').querySelectorAll('input:checked')].map(i => i.value)};
   const r = await fetch('/api/clients', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
   const d = await r.json(); if (!r.ok) throw Error(d.error);
   byId('clientDialog').close(); await load(); notify('Cliente guardado.');
  } catch (err) { notify(err.message); } finally { b.disabled = false; }
 };
 document.querySelector('[data-view="clients"]').addEventListener('click', load);

 // Búsqueda global: resultados mientras se escribe, navegación con flechas.
 const input = byId('globalSearch'), results = byId('globalResults');
 let timer, active = -1, items = [];
 const close = () => { results.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
 function go(item) {
  close(); input.value = '';
  if (item.type === 'placa') { document.querySelector('[data-view="nfc"]').click(); return; }
  document.querySelector('[data-view="clients"]').click();
  setTimeout(() => { const card = byId('client-' + item.id); if (card) { card.scrollIntoView({block: 'center'}); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); } }, 350);
 }
 function show(list) {
  items = list; active = -1;
  results.replaceChildren(...(list.length ? list.map((r, i) => { const li = el('li', null, 'search-item'); li.id = 'sr-' + i; li.setAttribute('role', 'option'); li.append(el('b', r.title), el('small', `${r.type === 'placa' ? 'Placa' : 'Cliente'} · ${r.subtitle}`)); li.onmousedown = e => { e.preventDefault(); go(r); }; return li; }) : [el('li', 'Sin resultados', 'search-empty')]));
  results.hidden = false; input.setAttribute('aria-expanded', 'true');
 }
 input.oninput = () => {
  clearTimeout(timer);
  const q = input.value.trim(); if (!q) return close();
  timer = setTimeout(async () => { try { const r = await fetch('/api/search?q=' + encodeURIComponent(q)); if (r.ok && input.value.trim() === q) show((await r.json()).results); } catch {} }, 150);
 };
 input.onkeydown = e => {
  if (results.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1); [...results.children].forEach((li, i) => li.classList.toggle('active', i === active)); input.setAttribute('aria-activedescendant', 'sr-' + active); }
  else if (e.key === 'Enter' && items[Math.max(active, 0)]) { e.preventDefault(); go(items[Math.max(active, 0)]); }
  else if (e.key === 'Escape') close();
 };
 input.onblur = () => setTimeout(close, 150);
})();
