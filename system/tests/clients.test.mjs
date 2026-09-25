import test from 'node:test';import assert from 'node:assert/strict';
import http from 'node:http';
import {resetDB} from './helpers.mjs';
import {saveClient,listClients,checkClients,search,validateClient} from '../clients.mjs';
import {saveTag} from '../nfc.mjs';

test('Validación de clientes',()=>{
 assert.throws(()=>validateClient({}),/nombre/);
 assert.throws(()=>validateClient({name:'X',domain:'no es dominio'}),/Dominio/);
 assert.throws(()=>validateClient({name:'X',monthly_fee:-5}),/Mensualidad/);
 assert.throws(()=>validateClient({name:'X',health_url:'javascript:alert(1)'}),/salud/);
 const c=validateClient({name:'Capital’s Barber',domain:'https://CapitalBarber.iongroup.cl/login',modules:['reservas','inventado']});
 assert.equal(c.slug,'capital-s-barber');assert.equal(c.domain,'capitalbarber.iongroup.cl');assert.deepEqual(c.modules,['reservas']);
});
test('Cartera: guardar, editar, buscar con errores y sinónimos',async()=>{
 await resetDB();
 const duo=await saveClient({name:'Dúo',category:'restaurante',city:'Coihueco',services:'Bowls y burritos',modules:['pedidos'],status:'desarrollo'});
 await saveClient({name:"Capital's Barber",category:'barberia',city:'Coihueco',modules:['reservas','ventas'],status:'activo',monthly_fee:30000});
 await saveClient({name:'Vega Barrón SpA',category:'administracion',city:'Ñuble',modules:['caja'],status:'activo'});
 await assert.rejects(saveClient({name:'Dúo'}),/Ya existe/);
 await saveClient({id:duo.id,name:'Dúo',category:'restaurante',city:'Coihueco',status:'activo'});
 assert.equal((await listClients()).find(c=>c.id===duo.id).status,'activo');
 await saveTag({code:'capital-mesa',client:"Capital's Barber",title:"Capital's Barber",actions:[{kind:'booking',url:'https://ejemplo.cl/reservar'}]});
 const titles=async q=>(await search(q)).map(r=>r.title);
 assert.deepEqual(await titles('duo'),['Dúo']);
 assert.ok((await titles('restaurant')).includes('Dúo'));
 assert.ok((await titles('barbria')).includes("Capital's Barber"),'error de tipeo');
 assert.ok((await titles('capital')).includes("Capital's Barber"));
 const reservar=await search('reservar');
 assert.ok(reservar.some(r=>r.title==="Capital's Barber")&&reservar.some(r=>r.type==='placa'));
 assert.deepEqual(await titles('burritos coihueco'),['Dúo']);
 assert.deepEqual(await titles('zzzz'),[]);
});
test('Monitoreo: marca en línea y caído sin romperse',async()=>{
 await resetDB();
 const server=http.createServer((req,res)=>{res.writeHead(req.url==='/health'?200:503);res.end();}).listen(0,'127.0.0.1');
 await new Promise(r=>server.once('listening',r));
 const port=server.address().port;
 try{
  await saveClient({name:'Arriba',health_url:`http://127.0.0.1:${port}/health`});
  await saveClient({name:'Error500',health_url:`http://127.0.0.1:${port}/x`});
  await saveClient({name:'Caido',health_url:'http://127.0.0.1:1/'});
  await saveClient({name:'Sin dominio'});
  assert.equal((await checkClients({timeout:2000})).checked,3);
  const by=Object.fromEntries((await listClients()).map(c=>[c.name,c]));
  assert.equal(by.Arriba.last_check_ok,true);assert.equal(by.Error500.last_check_ok,false);assert.equal(by.Caido.last_check_ok,false);assert.equal(by['Sin dominio'].last_check_ok,null);
 }finally{server.close();}
});
