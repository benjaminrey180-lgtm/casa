import test from 'node:test';import assert from 'node:assert/strict';
import {resetDB} from './helpers.mjs';
import {createCalendar,chileTime,eventICS} from '../calendar.mjs';
test('Fechas de Chile: desfase estacional y fechas inexistentes',()=>{assert.equal(chileTime('2026-09-22T10:00'),'2026-09-22T13:00:00.000Z');assert.equal(chileTime('2026-07-22T10:00'),'2026-07-22T14:00:00.000Z');assert.throws(()=>chileTime('2026-02-30T10:00'));assert.throws(()=>chileTime('2026-09-06T00:30'));});
test('Guardar, editar, completar y exportar sin perder persistencia',async()=>{
 await resetDB();
 let calendar=await createCalendar();
 const input={title:'Entrega, sistema',client:'Cliente',notes:'Prueba\nSegunda línea',kind:'Entrega de sistema',local:'2026-09-22T10:00',reminder:60};
 const event=await calendar.save(input);
 await calendar.save({...input,id:event.id,title:'Entrega final'});
 await calendar.toggle({id:event.id,done:true});
 calendar=await createCalendar();
 const list=await calendar.list();
 assert.equal(list.length,1);assert.equal(list[0].title,'Entrega final');assert.equal(list[0].done,true);
 const ics=eventICS(event);
 assert.match(ics,/DTSTART:20260922T130000Z/);assert.match(ics,/TRIGGER:-PT60M/);assert.match(ics,/SUMMARY:Entrega\\, sistema/);
 await assert.rejects(calendar.save({...input,reminder:-1}));
 await assert.rejects(calendar.save({...input,id:'no-existe'}),/no encontrado/);
 await assert.rejects(calendar.toggle({id:'no-existe',done:true}),/no encontrado/);
});
test('El .ics no permite inyectar líneas con retornos de carro',()=>{
 const ics=eventICS({id:'x',createdAt:'2026-09-01T00:00:00Z',start:'2026-09-22T13:00:00.000Z',title:'A\rATTENDEE:mailto:evil@x.com',kind:'Servicio',client:'',notes:'',reminder:0});
 assert.ok(!/\r(?!\n)/.test(ics));assert.ok(!ics.split('\r\n').some(l=>l.startsWith('ATTENDEE')));
});
