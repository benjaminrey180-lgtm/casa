import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import http from 'node:http';
import {resetDB} from './helpers.mjs';
import {hashPassword,verifyPassword,createUser,login,sessionUser,logout} from '../auth.mjs';

test('Contraseñas con scrypt: verifica la correcta y rechaza otras',async()=>{
 const hash=await hashPassword('una-clave-larga-123');
 assert.match(hash,/^scrypt\$/);assert.ok(!hash.includes('una-clave'));
 assert.ok(await verifyPassword('una-clave-larga-123',hash));
 assert.ok(!await verifyPassword('otra-clave-larga-123',hash));
 assert.ok(!await verifyPassword('x','basura'));
});
test('Usuarios, sesiones y límite de intentos',async()=>{
 await resetDB();
 await assert.rejects(createUser({email:'a@ion.cl',name:'A',password:'corta',role:'SUPERADMIN'}),/12/);
 await assert.rejects(createUser({email:'a@ion.cl',name:'A',password:'suficientemente-larga',role:'DIOS'}),/Rol/);
 await createUser({email:'Admin@Ion.cl',name:'Admin',password:'suficientemente-larga',role:'SUPERADMIN'});
 await assert.rejects(createUser({email:'admin@ion.cl',name:'Otro',password:'suficientemente-larga',role:'TRABAJADOR'}),/Ya existe/);
 const session=await login({email:'admin@ion.cl',password:'suficientemente-larga'},'1.1.1.1');
 assert.equal((await sessionUser(session.token)).role,'SUPERADMIN');
 assert.equal(await sessionUser('token-falso'),null);
 await logout(session.token);assert.equal(await sessionUser(session.token),null);
 for(let i=0;i<10;i++)await assert.rejects(login({email:'admin@ion.cl',password:'mala'},'2.2.2.2'),/incorrectos/);
 await assert.rejects(login({email:'admin@ion.cl',password:'suficientemente-larga'},'2.2.2.2'),/Demasiados/);
 // El atacante se bloquea a sí mismo, no al dueño de la cuenta desde otra IP.
 assert.ok((await login({email:'admin@ion.cl',password:'suficientemente-larga'},'4.4.4.4')).token);
 await assert.rejects(login({email:'nadie@ion.cl',password:'x'},'3.3.3.3'),/incorrectos/);
});
test('Servidor: modo local sin usuarios, túnel bloqueado y sesión obligatoria al crear usuarios',async()=>{
 await resetDB();
 const port=4300+Math.floor(Math.random()*90);
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:'https://abc.a.free.pinggy.net'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{server.stdout.on('data',d=>String(d).includes('ION:')&&resolve());server.on('exit',c=>reject(Error('Servidor terminó '+c)));setTimeout(()=>reject(Error('Timeout')),8000);});
  const base=`http://127.0.0.1:${port}`;
  const get=(path,headers={})=>fetch(base+path,{headers,redirect:'manual'});
  assert.equal((await get('/health')).status,200);
  assert.equal((await get('/api/state')).status,200,'modo local sin usuarios');
  // fetch no permite cambiar Host; se usa http.request para simular el túnel.
  const withHost=(host,path='/api/inbox')=>new Promise((resolve,reject)=>http.get({host:'127.0.0.1',port,path,headers:{Host:host}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
  assert.equal(await withHost('abc.a.free.pinggy.net'),401,'túnel configurado sin sesión');
  assert.equal(await withHost('rebind.atacante.com'),421,'DNS rebinding');
  assert.equal(await withHost('otro.a.free.pinggy.net','/webhooks/meta'),503,'webhooks siguen llegando por cualquier host (503: Meta sin configurar)');
  const csrf=await fetch(base+'/api/sectors',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({name:'Sin origen'})});
  assert.equal(csrf.status,403,'escritura sin Origin');
  const local=await fetch(base+'/api/sectors',{method:'POST',headers:{'Content-Type':'application/json',Origin:`http://localhost:${port}`},body:JSON.stringify({name:'Desde localhost'})});
  assert.equal(local.status,201,'crear sector desde localhost (antes 403)');
  assert.match((await get('/')).headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal((await get('/api/inbox',{'X-Forwarded-For':'8.8.8.8'})).status,401,'proxy sin sesión');
  await createUser({email:'admin@ion.cl',name:'Admin',password:'suficientemente-larga',role:'SUPERADMIN'});
  await createUser({email:'cliente@duo.cl',name:'Dúo',password:'suficientemente-larga',role:'ADMIN_CLIENTE',tenant:'duo'});
  assert.equal((await get('/api/state')).status,401,'con usuarios exige sesión');
  const page=await get('/');assert.equal(page.status,302);assert.equal(page.headers.get('location'),'/login.html');
  assert.equal((await get('/login.html')).status,200);
  const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...headers},body:JSON.stringify(body)});
  assert.equal((await post('/api/login',{email:'admin@ion.cl',password:'mala-clave-larga'})).status,401);
  assert.equal((await fetch(base+'/api/login',{method:'POST',body:JSON.stringify({email:'admin@ion.cl',password:'suficientemente-larga'})})).status,403,'login sin Origin');
  const ok=await post('/api/login',{email:'admin@ion.cl',password:'suficientemente-larga'});
  assert.equal(ok.status,200);
  const cookie=ok.headers.get('set-cookie');
  assert.match(cookie,/^ion_session=/,'sin Secure en localhost');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  const auth={Cookie:cookie.split(';')[0]};
  assert.equal((await get('/api/state',auth)).status,200);
  assert.equal((await (await get('/api/me',auth)).json()).user.email,'admin@ion.cl');
  const client=await post('/api/login',{email:'cliente@duo.cl',password:'suficientemente-larga'});
  assert.equal((await get('/api/inbox',{Cookie:client.headers.get('set-cookie').split(';')[0]})).status,401,'ADMIN_CLIENTE no entra al panel interno');
  await post('/api/logout',{},auth);
  assert.equal((await get('/api/state',auth)).status,401,'sesión cerrada');
 }finally{server.kill();}
});
