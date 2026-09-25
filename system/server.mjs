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
import {allowedOrigin} from './security.mjs';
await initDB();
const {rowCount: sectorCount} = await pool.query('SELECT 1 FROM sectors');
if (sectorCount === 0) {
  for (let i = 0; i < defaults.length; i++) {
    await pool.query('INSERT INTO sectors (id, name, agent) VALUES ($1, $2, $3)', [randomUUID(), defaults[i], agents[i%4]]);
  }
}
const integrations=await createIntegrations();
const manager=await createManager();
const calendar=await createCalendar();
const server=http.createServer(async(req,res)=>{
 const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 try {
  const url=new URL(req.url,'http://localhost');
  if(['/webhooks/meta','/webhooks/discord'].includes(url.pathname)){await integrations.webhook(req,res,url);return;}
  if(['/health','/api/health'].includes(url.pathname)&&req.method==='GET'){try{const dbMs=await checkDB();return json(200,{status:'ok',db:'ok',dbMs,uptime:Math.round(process.uptime()),version});}catch{return json(503,{status:'error',db:'error',version});}}
  if(req.method==='POST'&&req.headers.origin&&!allowedOrigin(req.headers.origin))return json(403,{error:'Origen no permitido'});
  if(req.method==='GET'&&url.pathname==='/api/calendar')return json(200,{events:await calendar.list()});
  if(req.method==='GET'&&url.pathname==='/api/calendar/export'){const events = await calendar.list(); const event=events.find(e=>e.id===url.searchParams.get('id'));if(!event)return json(404,{error:'Compromiso no encontrado'});res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="ion-compromiso.ics"'});return res.end(eventICS(event));}
  if(req.method==='POST'&&['/api/calendar','/api/calendar/status'].includes(req.url)){let input;try{input=JSON.parse(await rawBody(req));}catch{return json(400,{error:'Solicitud inválida'});}return json(200,await(req.url.endsWith('/status')?calendar.toggle(input):calendar.save(input)));}
  if(req.method==='GET'&&req.url==='/api/manager')return json(200,await manager.state());
  if(req.method==='POST'&&req.url==='/api/manager'){let input;try{input=JSON.parse(await rawBody(req));}catch{return json(400,{error:'Solicitud inválida'});}const {rows: sRows} = await pool.query('SELECT * FROM sectors');return json(202,await manager.submit(input?.text,input?.requestId,sRows));}
  if(req.method==='GET'&&req.url==='/api/integrations')return json(200,await integrations.status());
  if(req.method==='GET'&&req.url==='/api/inbox')return json(200,{messages:await integrations.inbox()});
  if(req.method==='POST'&&req.url==='/api/reply'){let input;try{input=JSON.parse(await rawBody(req));}catch{return json(400,{error:'Solicitud inválida'});}return json(200,await integrations.reply(input||{}));}
  if(req.method==='GET'&&req.url==='/api/state'){
   const {rows: tRows} = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
   const {rows: sRows} = await pool.query('SELECT * FROM sectors');
   const connections = Object.fromEntries(Object.entries(await integrations.status()).map(([k, v]) => [k, v.configured]));
   return json(200,{tasks:tRows.map(r=>({...r, createdAt:r.created_at})),sectors:sRows,departments:sRows.map(s=>s.name),agents,connections});
  }
  if(req.method==='POST'&&['/api/tasks','/api/sectors','/api/assign'].includes(req.url)){
   if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${server.address().port}`)return json(403,{error:'Origen no permitido'});
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
  if(req.method==='GET'&&['/','/nfc.html','/app.js','/style.css','/channels.js','/manager.js','/calendar.js','/assets/ion-group-logo.jpeg'].includes(req.url)){
   const name=req.url==='/'?'index.html':req.url.slice(1);res.writeHead(200,{'Content-Type':name.endsWith('.jpeg')?'image/jpeg':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(await readFile(new URL(`./public/${name}`,import.meta.url)));
  }
  json(404,{error:'No encontrado'});
 }catch(e){console.error(e.message);if(!res.headersSent)json(e.status||500,{error:e.status?e.message:'No se pudo completar la operación'});else res.end();}
});
server.listen(Number(process.env.PORT||4310),'127.0.0.1',()=>console.log(`ION: http://127.0.0.1:${server.address().port}`));
