// Vista NFC y QR: lista de placas con estadísticas, alta/edición y descarga del QR.
(() => {
 const byId = id => document.getElementById(id);
 const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
 let state = {tags: [], kinds: {}, publicBase: ''}, editing = null;
 const post = async (path, body) => { const r = await fetch('/api/nfc' + path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); const d = await r.json(); if (!r.ok) throw Error(d.error || 'No se pudo guardar'); return d; };
 const devices = {ios: 'iPhone', android: 'Android', desktop: 'Computador', otro: 'Otro'};

 async function load() {
  const r = await fetch('/api/nfc'); if (!r.ok) return;
  state = await r.json(); render();
 }
 function stat(label, value) { const b = el('div', null, 'nfc-stat'); b.append(el('b', String(value)), el('span', label)); return b; }
 function render() {
  const sum = key => state.tags.reduce((n, t) => n + (t[key] || 0), 0);
  byId('nfcSummary').replaceChildren(stat('Hoy', sum('today')), stat('7 días', sum('last7')), stat('30 días', sum('last30')), stat('Total', sum('visits')), stat('Placas activas', state.tags.filter(t => t.active).length));
  const list = byId('nfcList');
  if (!state.tags.length) { list.replaceChildren(el('p', 'Aún no hay placas. Crea la primera con “+ Nueva placa”.', 'panel subtle-empty')); return; }
  list.replaceChildren(...state.tags.map(t => {
   const card = el('article', null, 'nfc-card panel' + (t.active ? '' : ' inactive'));
   const head = el('div', null, 'nfc-head');
   const title = el('div'); title.append(el('h3', t.title), el('small', `${t.client}${t.campaign ? ' · ' + t.campaign : ''}`));
   head.append(title, el('span', t.active ? '● Activa' : '○ Inactiva', 'badge'));
   const link = el('a', `${state.publicBase}/${t.code}`, 'nfc-url'); link.href = `/nfc/${encodeURIComponent(t.code)}`; link.target = '_blank'; link.rel = 'noopener';
   const stats = el('div', null, 'nfc-stats'); stats.append(stat('Hoy', t.today), stat('7 días', t.last7), stat('30 días', t.last30), stat('Total', t.visits), stat('Clics', t.clicks));
   const detail = el('ul', null, 'nfc-detail');
   for (const a of t.actions) detail.append(el('li', `${a.label}: ${t.byAction[a.id] || 0} clics${t.redirect_action === a.id ? ' · directo' : ''}`));
   const dev = Object.entries(t.byDevice).map(([k, n]) => `${devices[k] || k} ${n}`).join(' · ');
   const meta = el('small', `Último acceso: ${t.last_access ? new Date(t.last_access).toLocaleString('es-CL', {timeZone: 'America/Santiago'}) : 'sin accesos'}${dev ? ' · ' + dev : ''}`, 'subtle');
   const tools = el('div', null, 'nfc-tools');
   const edit = el('button', 'Editar', 'secondary'); edit.type = 'button'; edit.onclick = () => open(t);
   const toggle = el('button', t.active ? 'Desactivar' : 'Activar', 'secondary'); toggle.type = 'button';
   toggle.onclick = async () => { toggle.disabled = true; try { await post('/status', {code: t.code, active: !t.active}); await load(); } catch (e) { notify(e.message); } finally { toggle.disabled = false; } };
   const qr = el('a', 'Descargar QR', 'secondary'); qr.href = `/api/nfc/qr?code=${encodeURIComponent(t.code)}`; qr.download = `qr-${t.code}.svg`;
   tools.append(edit, toggle, qr);
   card.append(head, link, stats, detail, meta, tools);
   return card;
  }));
 }
 function actionRow(a = {kind: 'review', label: '', url: ''}) {
  const row = el('div', null, 'nfc-action-row');
  const kind = el('select'); kind.setAttribute('aria-label', 'Tipo de acción');
  for (const [k, label] of Object.entries(state.kinds)) { const o = el('option', label); o.value = k; kind.append(o); }
  kind.value = a.kind;
  const label = el('input'); label.placeholder = 'Texto del botón'; label.maxLength = 40; label.value = a.label || ''; label.setAttribute('aria-label', 'Texto del botón');
  const url = el('input'); url.type = 'url'; url.placeholder = 'https://…  o  tel:+569…'; url.required = true; url.value = a.url || ''; url.setAttribute('aria-label', 'URL de destino'); url.inputMode = 'url';
  const remove = el('button', '✕', 'secondary'); remove.type = 'button'; remove.setAttribute('aria-label', 'Quitar acción'); remove.onclick = () => { row.remove(); syncRedirect(); };
  kind.onchange = syncRedirect; label.oninput = syncRedirect;
  row.dataset.id = a.id || '';
  row.append(kind, label, url, remove); byId('nfcActionRows').append(row); syncRedirect();
 }
 // Mismos ids que asigna el servidor (tipo, y tipo-índice si se repite) para que la redirección directa coincida.
 function rows() {
  const ids = new Set();
  return [...byId('nfcActionRows').children].map((r, i) => {
   const [kind, label, url] = r.querySelectorAll('select,input');
   let id = r.dataset.id || kind.value; while (ids.has(id)) id += '-' + i; ids.add(id);
   return {id, kind: kind.value, label: label.value.trim(), url: url.value.trim()};
  });
 }
 function syncRedirect(selected) {
  const select = byId('nfcRedirect'), current = selected ?? select.value;
  select.replaceChildren(el('option', 'Mostrar la página con botones'));
  select.firstChild.value = '';
  rows().forEach(a => { const id = a.id; const o = el('option', `Ir directo a: ${a.label || state.kinds[a.kind]}`); o.value = id; select.append(o); });
  select.value = [...select.options].some(o => o.value === current) ? current : '';
 }
 function open(tag) {
  editing = tag ? tag.code : null;
  byId('nfcDialogTitle').textContent = tag ? 'Editar placa' : 'Nueva placa';
  byId('nfcForm').reset(); byId('nfcActionRows').replaceChildren();
  byId('nfcCode').value = tag?.code || ''; byId('nfcCode').readOnly = !!tag; byId('nfcClient').value = tag?.client || ''; byId('nfcTitle').value = tag?.title || '';
  byId('nfcSubtitle').value = tag?.subtitle || ''; byId('nfcCampaign').value = tag?.campaign || ''; byId('nfcActive').checked = tag ? tag.active : true;
  (tag?.actions || [{kind: 'review'}, {kind: 'instagram'}, {kind: 'whatsapp'}]).forEach(actionRow);
  syncRedirect(tag?.redirect_action || '');
  byId('nfcDialog').showModal();
 }
 byId('nfcNew').onclick = () => open(null);
 byId('nfcAddAction').onclick = () => { if (byId('nfcActionRows').children.length < 8) actionRow({kind: 'web'}); };
 byId('nfcForm').onsubmit = async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  try {
   await post('', {original: editing, code: byId('nfcCode').value.trim().toLowerCase(), client: byId('nfcClient').value, title: byId('nfcTitle').value, subtitle: byId('nfcSubtitle').value, campaign: byId('nfcCampaign').value, active: byId('nfcActive').checked, redirect_action: byId('nfcRedirect').value || null, actions: rows()});
   byId('nfcDialog').close(); await load(); notify('Placa guardada. El cambio aplica de inmediato sin reprogramar el NFC.');
  } catch (err) { notify(err.message); } finally { button.disabled = false; }
 };
 document.querySelector('[data-view="nfc"]').addEventListener('click', load);
 load();
})();
