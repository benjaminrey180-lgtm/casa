import test from 'node:test';import assert from 'node:assert/strict';
import {Readable} from 'node:stream';import {createHmac,generateKeyPairSync,sign} from 'node:crypto';
import {resetDB,pool} from './helpers.mjs';
import {createIntegrations,metaSignature,discordSignature} from '../integrations.mjs';
const request=(raw,headers)=>{const req=Readable.from([raw]);req.method='POST';req.headers=headers;return req;};
const metaHeaders=(raw,secret)=>({'x-hub-signature-256':'sha256='+createHmac('sha256',secret).update(raw).digest('hex')});
async function hook(service,raw,headers,path){let code,body;await service.webhook(request(raw,headers),{writeHead(c){code=c},end(v){body=v}},new URL('https://example.com'+path));return {code,body};}
test('HMAC rechaza mensajes modificados y firmas ausentes',()=>{const raw=Buffer.from('{}'),sig='sha256='+createHmac('sha256','secret').update(raw).digest('hex');assert(metaSignature(raw,sig,'secret'));assert(!metaSignature(Buffer.from('{ }'),sig,'secret'));assert(!metaSignature(raw,undefined,'secret'));assert(!metaSignature(raw,sig,''));});
test('Discord exige firma válida y timestamp reciente',()=>{const {privateKey,publicKey}=generateKeyPairSync('ed25519'),key=publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex');const raw=Buffer.from('{}'),time=String(Math.floor(Date.now()/1000)),sig=sign(null,Buffer.concat([Buffer.from(time),raw]),privateKey).toString('hex');assert(discordSignature(raw,sig,time,key));assert(!discordSignature(raw,sig,'1',key));assert(!discordSignature(Buffer.from('bad'),sig,time,key));});
test('Meta: aislamiento de cuenta, deduplicación, persistencia y envío sin duplicados',async()=>{
 await resetDB();let sent=0;
 const env={META_APP_SECRET:'secret',META_VERIFY_TOKEN:'verify',META_API_VERSION:'v99.0',WHATSAPP_PHONE_NUMBER_ID:'phone',WHATSAPP_ACCESS_TOKEN:'secret-token'};
 const fetcher=async(url,options)=>{sent++;assert.match(url,/graph.facebook.com/);assert.equal(JSON.parse(options.body).to,'customer');return {ok:true,json:async()=>({messages:[{id:'sent-1'}]})}};
 let service=await createIntegrations({env,fetcher});
 const deliver=async(phone='phone',signed=true)=>{const raw=Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:phone},messages:[{id:'msg1',from:'customer',timestamp:String(Math.floor(Date.now()/1000)),type:'text',text:{body:'Hola'}}]}}]}]}));return (await hook(service,raw,signed?metaHeaders(raw,'secret'):{'x-hub-signature-256':''},'/webhooks/meta')).code;};
 assert.equal(await deliver('other'),200);assert.equal((await service.inbox()).length,0);
 assert.equal(await deliver('phone',false),401);
 await deliver();await deliver();assert.equal((await service.inbox()).length,1);
 service=await createIntegrations({env,fetcher});assert.equal((await service.inbox()).length,1);
 const payload={messageId:'whatsapp:msg1',text:'Hola, te atendemos en ION Group',requestId:'request-test-00001'};
 await service.reply(payload);await assert.rejects(service.reply(payload),/ya fue registrado/);assert.equal(sent,1);
 const out=(await service.inbox()).find(m=>m.direction==='out');assert.equal(out.status,'accepted');assert.equal(out.provider_id,'sent-1');
 assert.equal((await service.status()).instagram.configured,false);
});
test('Meta: verificación GET del webhook',async()=>{
 const service=await createIntegrations({env:{META_VERIFY_TOKEN:'verify'}});
 const get=async q=>{let code,body;await service.webhook({method:'GET',headers:{}},{writeHead(c){code=c},end(v){body=v}},new URL('https://example.com/webhooks/meta?'+q));return {code,body};};
 assert.deepEqual(await get('hub.mode=subscribe&hub.verify_token=verify&hub.challenge=abc'),{code:200,body:'abc'});
 assert.equal((await get('hub.mode=subscribe&hub.verify_token=otro&hub.challenge=abc')).code,403);
});
test('Un fallo de red deja envío incierto y bloquea reintento con el mismo ID',async()=>{
 await resetDB();
 await pool.query("INSERT INTO inbox (id,channel,sender,text,direction,status,timestamp,received_at) VALUES ('in1','instagram','client','Hola','in','received',$1,$2)",[Date.now(),new Date().toISOString()]);
 const service=await createIntegrations({env:{META_APP_SECRET:'s',META_VERIFY_TOKEN:'v',META_API_VERSION:'v99.0',INSTAGRAM_ACCESS_TOKEN:'t',INSTAGRAM_ACCOUNT_ID:'a'},fetcher:async()=>{throw Error('timeout')}});
 const input={messageId:'in1',text:'Hola',requestId:'request-timeout-01'};
 await assert.rejects(service.reply(input),/No se pudo confirmar/);
 assert.equal((await service.inbox()).find(m=>m.id==='out:request-timeout-01').status,'unknown');
 await assert.rejects(service.reply(input),/ya fue registrado/);
});
test('Respuesta fuera de la ventana de 24 horas se rechaza sin contactar a Meta',async()=>{
 await resetDB();
 await pool.query("INSERT INTO inbox (id,channel,sender,text,direction,status,timestamp,received_at) VALUES ('old','instagram','client','Hola','in','received',$1,$2)",[Date.now()-25*3600*1000,new Date().toISOString()]);
 const service=await createIntegrations({env:{META_APP_SECRET:'s',META_VERIFY_TOKEN:'v',META_API_VERSION:'v99.0',INSTAGRAM_ACCESS_TOKEN:'t',INSTAGRAM_ACCOUNT_ID:'a'},fetcher:async()=>{throw Error('No debe llamarse')}});
 await assert.rejects(service.reply({messageId:'old',text:'Hola',requestId:'request-window-001'}),/Fuera de la ventana/);
});
test('Discord restringe servidor y usuarios antes de guardar instrucciones',async()=>{
 await resetDB();const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const service=await createIntegrations({env:{DISCORD_PUBLIC_KEY:publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('hex'),DISCORD_GUILD_ID:'guild',DISCORD_ALLOWED_USER_IDS:'owner'}});
 const deliver=async user=>{const raw=Buffer.from(JSON.stringify({id:'interaction1',type:2,guild_id:'guild',member:{user:{id:user}},data:{name:'ion',options:[{name:'mensaje',value:'Preparar campaña'}]}}));const time=String(Math.floor(Date.now()/1000));return JSON.parse((await hook(service,raw,{'x-signature-timestamp':time,'x-signature-ed25519':sign(null,Buffer.concat([Buffer.from(time),raw]),privateKey).toString('hex')},'/webhooks/discord')).body);};
 assert.match((await deliver('stranger')).data.content,/no está autorizado/);assert.equal((await service.inbox()).length,0);
 assert.match((await deliver('owner')).data.content,/Recibido/);await deliver('owner');assert.equal((await service.inbox()).length,1);
});
test('Instagram ignora otra cuenta y ecos; recibe texto de la cuenta autorizada',async()=>{
 await resetDB();const service=await createIntegrations({env:{META_APP_SECRET:'s',INSTAGRAM_ACCOUNT_ID:'ion'}});
 for(const [account,echo,id] of [['other',false,'m1'],['ion',true,'m2'],['ion',false,'m3']]){const raw=Buffer.from(JSON.stringify({object:'instagram',entry:[{id:account,messaging:[{sender:{id:'customer'},recipient:{id:account},timestamp:Date.now(),message:{mid:id,text:'Hola',is_echo:echo}}]}]}));await hook(service,raw,metaHeaders(raw,'s'),'/webhooks/meta');}
 const inbox=await service.inbox();assert.equal(inbox.length,1);assert.equal(inbox[0].id,'instagram:m3');
});
test('Facebook usa la página autorizada y responde mediante Messenger',async()=>{
 await resetDB();let sent;
 const service=await createIntegrations({env:{META_APP_SECRET:'s',META_VERIFY_TOKEN:'v',META_API_VERSION:'v99.0',FACEBOOK_PAGE_ID:'ionpage',FACEBOOK_PAGE_TOKEN:'t'},fetcher:async(url,options)=>{sent={url,body:JSON.parse(options.body)};return {ok:true,json:async()=>({message_id:'sent'})}}});
 for(const page of ['other','ionpage']){const raw=Buffer.from(JSON.stringify({object:'page',entry:[{id:page,messaging:[{sender:{id:'customer'},recipient:{id:page},timestamp:Date.now(),message:{mid:'fb1',text:'Consulta'}}]}]}));await hook(service,raw,metaHeaders(raw,'s'),'/webhooks/meta');}
 assert.equal((await service.inbox()).length,1);
 await service.reply({messageId:'facebook:fb1',text:'Hola',requestId:'facebook-test-0001'});
 assert.match(sent.url,/graph.facebook.com\/v99.0\/ionpage\/messages/);assert.equal(sent.body.messaging_type,'RESPONSE');assert.equal(sent.body.recipient.id,'customer');
});
