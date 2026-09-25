import test from 'node:test';import assert from 'node:assert/strict';
import {resetDB,pool} from './helpers.mjs';
import {validateTag,safeURL,saveTag,setActive,listTags,handlePublic,qrSVG,deviceOf} from '../nfc.mjs';
const base={code:'duo-mesa-1',client:'Dúo',title:'Dúo',subtitle:'Bowls y burritos',campaign:'mesas',actions:[{kind:'menu',url:'https://example.com/menu'},{kind:'whatsapp',label:'Escríbenos',url:'https://wa.me/56900000000'}]};
async function visit(path,ua='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'){let status,headers,body;const handled=await handlePublic({method:'GET',headers:{'user-agent':ua}},{writeHead(c,h){status=c;headers=h},end(b){body=b}},new URL('https://iongroup.cl'+path));return {handled,status,headers,body};}

test('Validación: códigos, URLs seguras y límites',()=>{
 for(const bad of ['javascript:alert(1)','data:text/html,x','vbscript:x','notaurl','//evil.com'])assert.equal(safeURL(bad),null,bad);
 assert.equal(safeURL('tel:+56921745933'),'tel:+56921745933');
 assert.throws(()=>validateTag({...base,code:'A B'}),/código/);
 assert.throws(()=>validateTag({...base,code:'ab'}),/código/);
 assert.throws(()=>validateTag({...base,actions:[{kind:'menu',url:'javascript:alert(1)'}]}),/URL/);
 assert.throws(()=>validateTag({...base,actions:[]}),/acciones/);
 assert.throws(()=>validateTag({...base,actions:[{kind:'hack',url:'https://x.cl'}]}),/tipo/);
 assert.throws(()=>validateTag({...base,redirect_action:'nada'}),/redirección/);
 const t=validateTag({...base,actions:[{kind:'menu',url:'https://a.cl'},{kind:'menu',url:'https://b.cl'}]});
 assert.notEqual(t.actions[0].id,t.actions[1].id,'ids únicos');
 assert.equal(deviceOf('Mozilla/5.0 (Linux; Android 14)'),'android');
});
test('Landing pública, clics, redirección directa, desactivar y estadísticas',async()=>{
 await resetDB();
 await saveTag(base);
 await assert.rejects(saveTag(base),/Ya existe/);
 const view=await visit('/nfc/duo-mesa-1');
 assert.equal(view.status,200);assert.match(view.body,/Escríbenos/);assert.match(view.body,/Desarrollado por <a href="https:\/\/iongroup.cl"/);assert.match(view.body,/noindex/);
 const click=await visit('/nfc/duo-mesa-1/a/whatsapp');
 assert.equal(click.status,302);assert.equal(click.headers.Location,'https://wa.me/56900000000');
 await visit('/nfc/duo-mesa-1','WhatsApp/2.23 preview bot');
 assert.equal((await visit('/nfc/no-existe')).status,404);
 assert.equal((await visit('/nfc.html')).handled,false,'otras rutas no se interceptan');
 let [tag]=await listTags();
 assert.equal(tag.visits,1,'el bot no cuenta');assert.equal(tag.today,1);assert.equal(tag.clicks,1);assert.equal(tag.byAction.whatsapp,1);assert.equal(tag.byDevice.ios,1);
 // Cambiar el destino y renombrar sin perder estadísticas.
 await saveTag({...base,original:'duo-mesa-1',code:'duo-mesa-01',actions:[{kind:'menu',url:'https://example.com/menu-nuevo'}],redirect_action:'menu'});
 const direct=await visit('/nfc/duo-mesa-01');
 assert.equal(direct.status,302);assert.equal(direct.headers.Location,'https://example.com/menu-nuevo');
 [tag]=await listTags();assert.equal(tag.visits,2,'estadísticas conservadas al renombrar');
 await setActive('duo-mesa-01',false);
 assert.equal((await visit('/nfc/duo-mesa-01')).status,404);
 assert.match(await qrSVG('https://iongroup.cl','duo-mesa-01'),/^<svg/);
 const {rows}=await pool.query('SELECT * FROM nfc_events LIMIT 1');
 assert.deepEqual(Object.keys(rows[0]).sort(),['action','campaign','code','created_at','device','id'],'sin IP ni user-agent');
});
test('El título y los textos se escapan en la landing',async()=>{
 await resetDB();
 await saveTag({...base,code:'xss-test',title:'<script>alert(1)</script>',actions:[{kind:'web',label:'"><img src=x onerror=alert(1)>',url:'https://a.cl'}]});
 const {body}=await visit('/nfc/xss-test');
 assert.ok(!body.includes('<script>alert'));assert.ok(!body.includes('<img src=x'));
});
