// Sesión del panel: redirige al login si la API responde 401 y muestra el usuario con su botón de salida.
(() => {
 const nativeFetch = window.fetch.bind(window);
 window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  if (response.status === 401 && String(args[0]).startsWith('/api/')) location.replace('/login.html');
  return response;
 };
 nativeFetch('/api/me').then(r => r.json()).then(me => {
  if (!me.user) return;
  const header = document.querySelector('header');
  if (!header) return;
  const box = document.createElement('span'); box.className = 'session-box';
  const who = document.createElement('span'); who.className = 'muted'; who.textContent = `${me.user.name} · ${me.user.role}`;
  const out = document.createElement('button'); out.type = 'button'; out.className = 'session-logout'; out.textContent = 'Salir';
  out.onclick = async () => { await nativeFetch('/api/logout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}); location.replace('/login.html'); };
  box.append(who, out); header.append(box);
 }).catch(() => {});
})();
