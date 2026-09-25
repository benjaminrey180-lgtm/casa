import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export const companyProfile={name:'ION Group',activities:['Servicios','Desarrollo y entrega de sistemas','Ecommerce'],source:'Información confirmada por el propietario en esta conversación',statutes:'Pendientes de aportar y revisar; no se infieren actividades legales adicionales'};
export function chileTime(local){
 if(typeof local!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local))throw Error('Fecha inválida');
 const target=Date.parse(local+'Z');if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,16)!==local)throw Error('Fecha inválida');
 const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const format=ms=>formatter.format(new Date(ms)).replace(' ','T');let result=target;
 for(let i=0;i<4;i++){const actual=Date.parse(format(result)+'Z');result+=target-actual;}
 if(format(result)!==local)throw Error('Esa hora no existe en Chile por el cambio de horario. Elige otra.');
 return new Date(result).toISOString();
}
export function validateEvent(input){
 if(typeof input?.title!=='string'||!input.title.trim()||input.title.length>120||typeof input.client!=='string'||input.client.length>120||typeof input.notes!=='string'||input.notes.length>2000||!['Entrega de sistema','Servicio','Ecommerce','Reunión','Personal'].includes(input.kind)||![0,15,60,1440].includes(input.reminder))throw Object.assign(Error('Revisa los datos del compromiso.'),{status:400});
 let start;try{start=chileTime(input.local);}catch(e){throw Object.assign(e,{status:400});}
 return {title:input.title.trim(),client:input.client.trim(),notes:input.notes.trim(),kind:input.kind,local:input.local,start,reminder:input.reminder};
}
const escaped=text=>String(text).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
export function eventICS(event){
 const timestamp=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//ION Group//Agenda//ES','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:${event.id}@ion-group.local`,`DTSTAMP:${timestamp(event.createdAt)}`,`DTSTART:${timestamp(event.start)}`,`DTEND:${timestamp(Date.parse(event.start)+3600000)}`,`SUMMARY:${escaped(event.title)}`,`DESCRIPTION:${escaped([event.kind,event.client,event.notes].filter(Boolean).join('\n'))}`];
 if(event.reminder)lines.push('BEGIN:VALARM',`TRIGGER:-PT${event.reminder}M`,'ACTION:DISPLAY',`DESCRIPTION:${escaped(event.title)}`,'END:VALARM');lines.push('END:VEVENT','END:VCALENDAR');
 return lines.map(line=>{const parts=[];let part='',bytes=0;for(const char of line){const n=Buffer.byteLength(char);if(bytes+n>73){parts.push(part);part=' ';bytes=1;}part+=char;bytes+=n;}parts.push(part);return parts.join('\r\n');}).join('\r\n')+'\r\n';
}
export async function createCalendar(){
 const { pool, initDB } = await import('./db.mjs');
 await initDB();
 return {
  list: async () => { const { rows } = await pool.query('SELECT * FROM events'); return rows.map(r=>({...r, start: r.start_date, createdAt: r.created_at})); },
  save: async input => {
   const fields = validateEvent(input);
   if(input.id) {
    const {rowCount} = await pool.query('UPDATE events SET title=$1, client=$2, notes=$3, kind=$4, local=$5, start_date=$6, reminder=$7 WHERE id=$8', [fields.title, fields.client, fields.notes, fields.kind, fields.local, fields.start, fields.reminder, input.id]);
    if(rowCount===0) throw Object.assign(Error('Compromiso no encontrado'),{status:404});
    return {id: input.id, ...fields};
   }
   const id = randomUUID();
   const createdAt = new Date().toISOString();
   await pool.query('INSERT INTO events (id, title, client, notes, kind, local, start_date, reminder, done, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, fields.title, fields.client, fields.notes, fields.kind, fields.local, fields.start, fields.reminder, false, createdAt]);
   return {id, ...fields, done: false, createdAt};
  },
  toggle: async input => {
   if(typeof input?.done!=='boolean') throw Object.assign(Error('Estado inválido'),{status:400});
   const {rowCount} = await pool.query('UPDATE events SET done=$1 WHERE id=$2', [input.done, input.id]);
   if(rowCount===0) throw Object.assign(Error('Compromiso no encontrado'),{status:404});
   return {ok: true};
  }
 };
}
