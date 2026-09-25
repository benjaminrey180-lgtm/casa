import {createHmac,createHash,timingSafeEqual,createPublicKey,verify,randomUUID} from 'node:crypto';
// Comparación en tiempo constante (sobre hashes para igualar longitudes).
const sameSecret=(a,b)=>timingSafeEqual(createHash('sha256').update(String(a??'')).digest(),createHash('sha256').update(String(b??'')).digest());
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
export function metaSignature(raw, signature, secret) {
 if(!secret||!/^sha256=[a-f0-9]{64}$/i.test(signature||''))return false;
 return timingSafeEqual(createHmac('sha256',secret).update(raw).digest(),Buffer.from(signature.slice(7),'hex'));
}
export function discordSignature(raw, signature, timestamp, key) {
 if(!/^[a-f0-9]{128}$/i.test(signature||'')||!/^[a-f0-9]{64}$/i.test(key||'')||!/^\d+$/.test(timestamp||'')||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
 try {return verify(null,Buffer.concat([Buffer.from(timestamp),raw]),createPublicKey({key:Buffer.from('302a300506032b6570032100'+key,'hex'),format:'der',type:'spki'}),Buffer.from(signature,'hex'));}catch{return false;}
}
export async function rawBody(req) {const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1048576)throw Object.assign(Error('Solicitud demasiado grande'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}
export async function createIntegrations({env=process.env,fetcher=fetch}={}) {
 const { pool } = await import('./db.mjs');
 const required={facebook:['META_APP_SECRET','META_VERIFY_TOKEN','META_API_VERSION','FACEBOOK_PAGE_TOKEN','FACEBOOK_PAGE_ID'],whatsapp:['META_APP_SECRET','META_VERIFY_TOKEN','META_API_VERSION','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID'],instagram:['META_APP_SECRET','META_VERIFY_TOKEN','META_API_VERSION','INSTAGRAM_ACCESS_TOKEN','INSTAGRAM_ACCOUNT_ID'],discord:['DISCORD_PUBLIC_KEY','DISCORD_GUILD_ID','DISCORD_ALLOWED_USER_IDS']};
 
 const status=async()=>{
  // Solo el último mensaje recibido por canal, sin leer toda la bandeja.
  const {rows} = await pool.query("SELECT DISTINCT ON (channel) channel, received_at FROM inbox WHERE direction='in' ORDER BY channel, timestamp DESC");
  const last=Object.fromEntries(rows.map(r=>[r.channel,r.received_at]));
  return Object.fromEntries(Object.entries(required).map(([channel,keys])=>[channel,{configured:keys.every(k=>Boolean(env[k]?.trim())),missing:keys.filter(k=>!env[k]?.trim()),lastReceived:last[channel]||null}]));
 };
 
 async function receive(incoming){
  for(const m of incoming){
   await pool.query('INSERT INTO inbox (id, channel, sender, text, direction, status, timestamp, received_at, channel_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING', [m.id, m.channel, m.sender, m.text, 'in', 'received', m.timestamp, new Date().toISOString(), m.channelId||null]);
  }
 }
 async function webhook(req,res,url){
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/webhooks/meta'){
   if(req.method==='GET'){
    if(!env.META_VERIFY_TOKEN)return send(503,{error:'Meta no configurado'});
    if(url.searchParams.get('hub.mode')!=='subscribe'||!sameSecret(url.searchParams.get('hub.verify_token'),env.META_VERIFY_TOKEN))return send(403,{error:'Verificación inválida'});
    res.writeHead(200,{'Content-Type':'text/plain'});res.end(url.searchParams.get('hub.challenge')||'');return true;
   }
   if(req.method!=='POST')return send(405,{error:'Método no permitido'});
   const raw=await rawBody(req);if(!metaSignature(raw,req.headers['x-hub-signature-256'],env.META_APP_SECRET))return send(401,{error:'Firma inválida'});
   let body;try{body=JSON.parse(raw);}catch{return send(400,{error:'JSON inválido'});}
   const incoming=[];
   for(const entry of body.entry||[]){
    if(body.object==='whatsapp_business_account')for(const c of entry.changes||[]){const v=c.value;if(!env.WHATSAPP_PHONE_NUMBER_ID||v?.metadata?.phone_number_id!==env.WHATSAPP_PHONE_NUMBER_ID)continue;for(const m of v.messages||[])if(m.id&&m.from){const time=Number(m.timestamp)*1000;if(!Number.isFinite(time))continue;incoming.push({id:'whatsapp:'+m.id,channel:'whatsapp',sender:String(m.from),text:m.text?.body||`[Mensaje ${m.type||'multimedia'}: revisar en WhatsApp]`,timestamp:time});}}
    if(body.object==='instagram'&&env.INSTAGRAM_ACCOUNT_ID&&entry.id===env.INSTAGRAM_ACCOUNT_ID)for(const e of entry.messaging||[]){if(e.message?.mid&&e.sender?.id&&!e.message.is_echo&&e.recipient?.id===env.INSTAGRAM_ACCOUNT_ID){const time=Number(e.timestamp);if(!Number.isFinite(time))continue;incoming.push({id:'instagram:'+e.message.mid,channel:'instagram',sender:String(e.sender.id),text:e.message.text||'[Mensaje multimedia: revisar en Instagram]',timestamp:time});}}
    if(body.object==='page'&&env.FACEBOOK_PAGE_ID&&entry.id===env.FACEBOOK_PAGE_ID)for(const e of entry.messaging||[]){if(e.message?.mid&&e.sender?.id&&!e.message.is_echo&&e.recipient?.id===env.FACEBOOK_PAGE_ID){const time=Number(e.timestamp);if(!Number.isFinite(time))continue;incoming.push({id:'facebook:'+e.message.mid,channel:'facebook',sender:String(e.sender.id),text:e.message.text||'[Mensaje multimedia: revisar en Facebook]',timestamp:time});}}
   }
   await receive(incoming);return send(200,{ok:true});
  }
  if(url.pathname==='/webhooks/discord'){
   if(req.method!=='POST')return send(405,{error:'Método no permitido'});
   const raw=await rawBody(req);if(!discordSignature(raw,req.headers['x-signature-ed25519'],req.headers['x-signature-timestamp'],env.DISCORD_PUBLIC_KEY))return send(401,{error:'Firma inválida'});
   let body;try{body=JSON.parse(raw);}catch{return send(400,{error:'JSON inválido'});}
   if(body.type===1)return send(200,{type:1});
   const reply=text=>send(200,{type:4,data:{content:text,flags:64,allowed_mentions:{parse:[]}}});
   const user=body.member?.user?.id;
   if(!env.DISCORD_GUILD_ID||body.guild_id!==env.DISCORD_GUILD_ID||!(env.DISCORD_ALLOWED_USER_IDS||'').split(',').map(s=>s.trim()).includes(user))return reply('Este usuario o servidor no está autorizado en ION Group.');
   if(body.type!==2||body.data?.name!=='ion')return reply('Comando no compatible. Usa /ion mensaje.');
   const text=body.data.options?.find(o=>o.name==='mensaje')?.value;
   if(typeof text!=='string'||!text.trim()||text.length>2000)return reply('Escribe un mensaje de entre 1 y 2000 caracteres.');
   await receive([{id:'discord:'+body.id,channel:'discord',sender:user,text,timestamp:Date.now(),channelId:body.channel_id}]);
   return reply('Recibido en la bandeja de ION Group. Pendiente de atención; los agentes aún no están conectados.');
  }
 }
 async function reply({messageId,text,requestId}){
  if(typeof text!=='string'||!text.trim()||text.length>2000||typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw Object.assign(Error('Respuesta inválida'),{status:400});
  const {rows: parentRows} = await pool.query("SELECT * FROM inbox WHERE id=$1 AND direction='in'", [messageId]);
  const parent = parentRows[0];
  if(!parent)throw Object.assign(Error('Conversación no encontrada'),{status:404});
  if(parent.channel==='discord')throw Object.assign(Error('Responde en Discord. El envío desde el panel está pendiente.'),{status:409});
  
  const currentStatus = await status();
  if(!currentStatus[parent.channel].configured)throw Object.assign(Error('Faltan credenciales del canal'),{status:409});
  
  const {rows: latestRows} = await pool.query("SELECT MAX(timestamp) as latest FROM inbox WHERE direction='in' AND channel=$1 AND sender=$2", [parent.channel, parent.sender]);
  const latest = parseInt(latestRows[0]?.latest || 0, 10);
  if(Date.now()-latest>24*3600*1000||latest>Date.now()+60000)throw Object.assign(Error('Fuera de la ventana de respuesta. Revisa la conversación en el canal.'),{status:409});
  if(!/^v\d+\.\d+$/.test(env.META_API_VERSION))throw Object.assign(Error('Versión de Meta no configurada correctamente'),{status:409});
  
  const key='out:'+requestId;
  try {
   await pool.query('INSERT INTO inbox (id, channel, sender, text, direction, status, timestamp, received_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [key, parent.channel, parent.sender, text.trim(), 'out', 'sending', Date.now(), new Date().toISOString()]);
  } catch (e) {
   throw Object.assign(Error('Este envío ya fue registrado. Revisa su estado antes de volver a enviar.'),{status:409});
  }
  
  const whatsapp=parent.channel==='whatsapp';const facebook=parent.channel==='facebook';const account=whatsapp?env.WHATSAPP_PHONE_NUMBER_ID:facebook?env.FACEBOOK_PAGE_ID:env.INSTAGRAM_ACCOUNT_ID;
  const body=whatsapp?{messaging_product:'whatsapp',to:parent.sender,type:'text',text:{body:text.trim()}}:{recipient:{id:parent.sender},message:{text:text.trim()},...(facebook?{messaging_type:'RESPONSE'}:{})};
  let result;
  try{const response=await fetcher(`https://${(whatsapp||facebook)?'graph.facebook.com':'graph.instagram.com'}/${env.META_API_VERSION}/${encodeURIComponent(account)}/messages`,{method:'POST',headers:{Authorization:`Bearer ${whatsapp?env.WHATSAPP_ACCESS_TOKEN:facebook?env.FACEBOOK_PAGE_TOKEN:env.INSTAGRAM_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});result=await response.json();if(!response.ok){const error=Error('El canal rechazó el envío. Revisa permisos, cuenta y vigencia de la conversación.');error.rejected=response.status>=400&&response.status<500;throw error;}if(!(result.messages?.[0]?.id||result.message_id))throw Error('El proveedor no confirmó el identificador del envío');}
  catch(e){
   await pool.query('UPDATE inbox SET status=$1 WHERE id=$2', [e.rejected?'failed':'unknown', key]);
   throw Object.assign(Error(e.rejected?e.message:'No se pudo confirmar el envío. Revisa el canal antes de reintentar para evitar duplicados.'),{status:502});
  }
  await pool.query('UPDATE inbox SET status=$1, provider_id=$2 WHERE id=$3', ['accepted', result.messages?.[0]?.id||result.message_id, key]);
  return {ok:true,status:'accepted'};
 }
 return {status,webhook,reply,inbox:async()=>{const {rows} = await pool.query('SELECT * FROM inbox ORDER BY timestamp DESC LIMIT 500'); return rows;}};
}
