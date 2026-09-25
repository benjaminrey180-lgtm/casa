import {createCalendar,eventICS} from './calendar.mjs';
import {createManager} from './manager.mjs';
import {loadEnvFile} from 'node:process';
import {createIntegrations,rawBody} from './integrations.mjs';
try{loadEnvFile(new URL('./.env',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const agents = ['Hermes', 'Claude Code', 'Antigravity', 'ChatGPT / Codex', 'Arena'];
const defaults = ['Dirección', 'Marketing', 'Finanzas', 'Ventas', 'Operaciones', 'Tecnología', 'Atención al cliente'];
import { pool, initDB, checkDB } from './db.mjs';
const {version}=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8'));
import {allowedOrigin,allowedHost,securityHeaders} from './security.mjs';
import {handlePublic as handleNFC,listTags,saveTag,setActive,qrSVG,ACTION_KINDS} from './nfc.mjs';
// Dominio público donde viven las placas (iongroup.cl/nfc/[código]).
const nfcBase=(process.env.NFC_PUBLIC_BASE||'https://iongroup.cl').replace(/\/$/,'');
import {initAuth,login,logout,sessionUser,userCount,readCookie,sessionCookie,isLocalHost,PANEL_ROLES} from './auth.mjs';
await initDB();
await initAuth();
const {rowCount: sectorCount} = await pool.query('SELECT 1 FROM sectors');
if (sectorCount === 0) {
  for (let i = 0; i < defaults.length; i++) {
    await pool.query('INSERT INTO sectors (id, name, agent) VALUES ($1, $2, $3)', [randomUUID(), defaults[i], agents[i%4]]);
  }
}
const integrations=await createIntegrations();
const manager=await createManager();
const calendar=await createCalendar();
const staticFiles=['/','/nfc.html','/login.html','/login.js','/auth.js','/app.js','/style.css','/channels.js','/manager.js','/calendar.js','/nfc.js','/manifest.webmanifest','/assets/ion-group-logo.jpeg','/assets/ion-group-logo-480.webp','/assets/ion-group-logo-960.webp','/assets/icon-192.png','/assets/icon-512.png','/assets/apple-touch-icon.png'];
const mime={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',jpeg:'image/jpeg',webp:'image/webp',png:'image/png',webmanifest:'application/manifest+json'};
async function readJSON(req){const raw=await rawBody(req);try{return JSON.parse(raw);}catch{throw Object.assign(Error('Solicitud inválida'),{status:400});}}
const server=http.createServer(async(req,res)=>{
 const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 try {
  const url=new URL(req.url,'http://localhost');
  if(['/webhooks/meta','/webhooks/discord'].includes(url.pathname)){await integrations.webhook(req,res,url);return;}
  if(['/health','/api/health'].includes(url.pathname)&&req.method==='GET'){try{const dbMs=await checkDB();return json(200,{status:'ok',db:'ok',dbMs,uptime:Math.round(process.uptime()),version});}catch{return json(503,{status:'error',db:'error',version});}}
  // Placas NFC/QR: públicas y servidas desde el dominio de ION, por eso van antes del control de host.
  if(url.pathname.startsWith('/nfc/')&&await handleNFC(req,res,url))return;
  if(!allowedHost(req.headers.host))return json(421,{error:'Host no permitido. Si usas un túnel, define PUBLIC_ORIGIN.'});
  for(const [k,v] of Object.entries(securityHeaders))res.setHeader(k,v);
  // Toda escritura exige un Origin permitido (los navegadores lo envían siempre en POST).
  if(req.method!=='GET'&&!allowedOrigin(req.headers.origin))return json(403,{error:'Origen no permitido'});
  // Autenticación: público solo lo necesario para iniciar sesión.
  if(req.method==='POST'&&url.pathname==='/api/login'){let input;input=await readJSON(req);const session=await login(input||{},req.socket.remoteAddress);res.setHeader('Set-Cookie',sessionCookie(session.token,session.expires,!isLocalHost(req)));return json(200,{user:session.user});}
  if(req.method==='POST'&&url.pathname==='/api/logout'){await logout(readCookie(req));res.setHeader('Set-Cookie',sessionCookie('',null,!isLocalHost(req)));return json(200,{ok:true});}
  const publicPaths=['/login.html','/login.js','/style.css','/nfc.html','/api/me','/manifest.webmanifest','/assets/ion-group-logo.jpeg','/assets/ion-group-logo-480.webp','/assets/ion-group-logo-960.webp','/assets/icon-192.png','/assets/icon-512.png','/assets/apple-touch-icon.png'];
  const user=await sessionUser(readCookie(req));
  const users=await userCount();
  // Sin usuarios creados se conserva el modo local anterior, pero nunca a través de un túnel o proxy.
  const allowed=(user&&PANEL_ROLES.includes(user.role))||(users===0&&isLocalHost(req));
  if(req.method==='GET'&&url.pathname==='/api/me')return json(200,{user,setupRequired:users===0,localMode:!user&&users===0&&isLocalHost(req)});
  if(!allowed&&!publicPaths.includes(url.pathname)){
   if(url.pathname.startsWith('/api/'))return json(401,{error:users===0?'Crea el primer usuario administrador con npm run user:create.':'Inicia sesión.'});
   res.writeHead(302,{Location:'/login.html','Cache-Control':'no-store'});return res.end();
  }
  if(req.method==='GET'&&url.pathname==='/api/calendar')return json(200,{events:await calendar.list()});
  if(req.method==='GET'&&url.pathname==='/api/calendar/export'){const events = await calendar.list(); const event=events.find(e=>e.id===url.searchParams.get('id'));if(!event)return json(404,{error:'Compromiso no encontrado'});res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="ion-compromiso.ics"'});return res.end(eventICS(event));}
  if(req.method==='POST'&&['/api/calendar','/api/calendar/status'].includes(req.url)){let input;input=await readJSON(req);return json(200,await(req.url.endsWith('/status')?calendar.toggle(input):calendar.save(input)));}
  if(req.method==='GET'&&req.url==='/api/manager')return json(200,await manager.state());
  if(req.method==='POST'&&req.url==='/api/manager'){let input;input=await readJSON(req);const {rows: sRows} = await pool.query('SELECT * FROM sectors');return json(202,await manager.submit(input?.text,input?.requestId,sRows));}
  if(req.method==='GET'&&url.pathname==='/api/nfc')return json(200,{tags:await listTags(),kinds:ACTION_KINDS,publicBase:nfcBase});
  if(req.method==='POST'&&url.pathname==='/api/nfc'){const input=await readJSON(req);return json(200,await saveTag(input||{}));}
  if(req.method==='POST'&&url.pathname==='/api/nfc/status'){const input=await readJSON(req);return json(200,await setActive(input?.code,input?.active));}
  if(req.method==='GET'&&url.pathname==='/api/nfc/qr'){const code=url.searchParams.get('code')||'';if(!/^[a-z0-9-]{3,40}$/.test(code))return json(400,{error:'Código inválido'});res.writeHead(200,{'Content-Type':'image/svg+xml','Content-Disposition':`attachment; filename="qr-${code}.svg"`,'Cache-Control':'no-store'});return res.end(await qrSVG(nfcBase,code));}
  if(req.method==='GET'&&req.url==='/api/integrations')return json(200,await integrations.status());
  if(req.method==='GET'&&req.url==='/api/inbox')return json(200,{messages:await integrations.inbox()});
  if(req.method==='POST'&&req.url==='/api/reply'){let input;input=await readJSON(req);return json(200,await integrations.reply(input||{}));}
  if(req.method==='GET'&&req.url==='/api/state'){
   const {rows: tRows} = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
   const {rows: sRows} = await pool.query('SELECT * FROM sectors');
   const connections = Object.fromEntries(Object.entries(await integrations.status()).map(([k, v]) => [k, v.configured]));
   return json(200,{tasks:tRows.map(r=>({...r, createdAt:r.created_at})),sectors:sRows,departments:sRows.map(s=>s.name),agents,connections});
  }
  if(req.method==='POST'&&['/api/tasks','/api/sectors','/api/assign'].includes(req.url)){
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16000)return json(413,{error:'Mensaje demasiado largo'});}
   let input;try{input=JSON.parse(body);}catch{return json(400,{error:'Solicitud inválida'});}
   const {rows: sRows} = await pool.query('SELECT * FROM sectors');
   
   if(req.url==='/api/tasks'){
    if(typeof input?.text!=='string'||!input.text.trim()||input.text.length>4000||!sRows.some(s=>s.name===input.department)||!agents.includes(input.agent))return json(400,{error:'Revisa la tarea, el sector y el agente'});
    const task={id:randomUUID(),text:input.text.trim(),department:input.department,agent:input.agent,status:'Pendiente de conexión',createdAt:new Date().toISOString()};
    await pool.query('INSERT INTO tasks (id, text, department, agent, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [task.id, task.text, task.department, task.agent, task.status, task.createdAt]);
    return json(201,task);
   }
   if(req.url==='/api/sectors'){
    if(typeof input?.name!=='string'||!input.name.trim()||input.name.trim().length>40)return json(400,{error:'El nombre debe tener entre 1 y 40 caracteres'});
    const sector={id:randomUUID(),name:input.name.trim(),agent:null};
    if(sRows.length>=18||sRows.some(s=>s.name.toLowerCase()===sector.name.toLowerCase()))return json(409,{error:'Usa un nombre distinto. Máximo 18 sectores.'});
    await pool.query('INSERT INTO sectors (id, name, agent) VALUES ($1,$2,$3)', [sector.id, sector.name, sector.agent]);
    return json(201,sector);
   }
   if(!sRows.some(s=>s.id===input?.id)||(input.agent!==null&&!agents.includes(input.agent)))return json(400,{error:'Sector o agente inválido'});
   await pool.query('UPDATE sectors SET agent=$1 WHERE id=$2', [input.agent, input.id]);
   return json(200,{ok:true});
  }
  if(req.method==='GET'&&staticFiles.includes(req.url)){
   const name=req.url==='/'?'index.html':req.url.slice(1);
   // Los assets de imagen se cachean un día; HTML/JS/CSS se revalidan en cada carga.
   res.writeHead(200,{'Content-Type':mime[name.split('.').pop()],'Cache-Control':name.startsWith('assets/')?'public, max-age=86400':'no-cache'});
   return res.end(await readFile(new URL(`./public/${name}`,import.meta.url)));
  }
  json(404,{error:'No encontrado'});
 }catch(e){console.error(e.message);if(!res.headersSent)json(e.status||500,{error:e.status?e.message:'No se pudo completar la operación'});else res.end();}
});
server.listen(Number(process.env.PORT||4310),'127.0.0.1',()=>console.log(`ION: http://127.0.0.1:${server.address().port}`));
