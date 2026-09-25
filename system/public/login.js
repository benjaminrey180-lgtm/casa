(async () => {
 const form = document.getElementById('loginForm'), error = document.getElementById('loginError'), button = document.getElementById('loginButton');
 const show = text => { error.textContent = text; error.hidden = !text; };
 try {
  const me = await (await fetch('/api/me')).json();
  if (me.user || me.localMode) return location.replace('/');
  if (me.setupRequired) {
   document.getElementById('loginHint').textContent = 'Aún no hay usuarios. En el equipo del servidor ejecuta: npm run user:create';
   button.disabled = true;
  }
 } catch { show('No se pudo contactar al servidor.'); }
 form.onsubmit = async event => {
  event.preventDefault(); show(''); button.disabled = true;
  try {
   const response = await fetch('/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email: form.email.value, password: form.password.value})});
   const data = await response.json();
   if (!response.ok) throw Error(data.error || 'No se pudo iniciar sesión');
   location.replace('/');
  } catch (e) { show(e.message); form.password.value = ''; form.password.focus(); }
  finally { button.disabled = false; }
 };
})();
