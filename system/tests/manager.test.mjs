import test from 'node:test';import assert from 'node:assert/strict';
import {resetDB,pool} from './helpers.mjs';
import {createManager,cliCommand} from '../manager.mjs';
async function finished(manager){for(let i=0;i<200;i++){if(!(await manager.state()).busy)return;await new Promise(r=>setTimeout(r,10));}throw Error('Timeout');}
test('El jefe delega por área, usa general y conserva resultados sin repetir peticiones',async()=>{
 await resetDB();let calls=0;
 const runner=async(p,s)=>{calls++;return s?{reply:'Repartido',tasks:[{area:'Marketing',instruction:'Redacta campaña',needsExternalAction:false},{area:'Inventada',instruction:'Publicar idea',needsExternalAction:true}]}:'Resultado real del trabajador de prueba'};
 const sectors=[{name:'Marketing',agent:null}];
 const manager=await createManager({runner});
 const job=await manager.submit('Campaña y otra idea','request-manager-0001',sectors);
 await finished(manager);
 const result=(await manager.state()).jobs[0];
 assert.equal(result.status,'done');assert.equal(result.tasks[0].status,'done');
 assert.equal(result.tasks[1].area,'Asistencia general');assert.equal(result.tasks[1].status,'draft');
 assert.equal((await manager.submit('Campaña y otra idea','request-manager-0001',sectors)).id,job.id);
 assert.equal(calls,3);
 const restored=await createManager({runner});
 assert.equal((await restored.state()).jobs[0].tasks[0].result,'Resultado real del trabajador de prueba');
});
test('Fallo del motor es visible y un reinicio no repite acciones',async()=>{
 await resetDB();
 const manager=await createManager({runner:async()=>{throw Error('Sin sesión')}});
 await manager.submit('Haz algo','request-error-0001',[]);await finished(manager);
 assert.equal((await manager.state()).jobs[0].status,'error');
 await resetDB();
 await pool.query("INSERT INTO jobs (id,request_id,text,reply,status,created_at,tasks) VALUES ('interrupted','request-interrupt-01','x','',$1,$2,$3)",['working',new Date().toISOString(),JSON.stringify([{status:'working'}])]);
 const restored=await createManager({runner:async()=>{throw Error('No debe ejecutarse')}});
 const job=(await restored.state()).jobs[0];
 assert.equal(job.status,'interrupted');assert.equal(job.tasks[0].status,'interrupted');
});
test('Los agentes CLI reciben el prompt como argumento, sin shell y en modo restringido',()=>{
 const hostile='hola"; rm -rf ~ ; echo "$(whoami)` + "`id`" + `\\';
 const [claudeBin,claudeArgs]=cliCommand('Claude Code',hostile);
 assert.match(claudeBin,/\.local\/bin\/claude$/);assert.equal(claudeArgs[1],hostile);
 assert.ok(claudeArgs.includes('--disallowedTools'));assert.match(claudeArgs.at(-1),/Bash/);
 const [codexBin,codexArgs]=cliCommand('ChatGPT / Codex',hostile);
 assert.match(codexBin,/codex$/);assert.deepEqual(codexArgs,['exec','--sandbox','read-only',hostile]);
 assert.throws(()=>cliCommand('Desconocido','x'));
});
