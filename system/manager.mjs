import {companyProfile} from './calendar.mjs';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {GoogleGenAI} from '@google/genai';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';

const execAsync = promisify(exec);

async function runCLI(engine, instruction, context) {
  const sanitize = (str) => String(str).replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
  const prompt = `${instruction} - Contexto de la solicitud: ${context}`;
  let cmd = '';

  if (engine === 'Claude Code') {
    cmd = `~/.local/bin/claude -p "${sanitize(prompt)}"`;
  } else if (engine === 'Hermes') {
    cmd = `~/.local/bin/hermes "${sanitize(prompt)}"`;
  } else if (engine === 'ChatGPT / Codex') {
    cmd = `~/.local/bin/codex exec "${sanitize(prompt)}"`;
  } else if (engine === 'Antigravity' || engine === 'Arena') {
    cmd = `~/.local/bin/claude -p "${sanitize(prompt)}"`;
  } else {
    throw new Error('No CLI mapping for ' + engine);
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, { env: process.env, cwd: process.cwd(), timeout: 120000, shell: '/bin/bash' });
    return stdout || stderr || 'Sin salida';
  } catch (e) {
    return `Error en ejecución CLI: ${e.message}\n${e.stdout || ''}\n${e.stderr || ''}`;
  }
}

const planSchema={type:'object',properties:{reply:{type:'string'},tasks:{type:'array',maxItems:4,items:{type:'object',properties:{area:{type:'string'},instruction:{type:'string'},needsExternalAction:{type:'boolean'}},required:['area','instruction','needsExternalAction'],additionalProperties:false}}},required:['reply','tasks'],additionalProperties:false};

export async function runGemini(prompt,schema){
  if(!process.env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY en .env');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'Eres parte del equipo ION Group. Responde en español. Nunca afirmes haber enviado, publicado, leído archivos o realizado acciones externas (a menos que uses una herramienta). Entrega contenido útil y distingue claramente borradores y limitaciones.',
        ...(schema ? {
          responseMimeType: 'application/json',
          responseSchema: schema
        } : {})
      }
    });
    if (schema) {
      return JSON.parse(response.text);
    }
    return response.text;
  } catch(e) {
    throw new Error('El agente no pudo responder: ' + e.message);
  }
}

export async function createManager({runner=runGemini}={}){
 const { pool } = await import('./db.mjs');
 let busy=false;
 
 const getJobs = async () => {
   const {rows} = await pool.query('SELECT * FROM jobs ORDER BY created_at ASC');
   return rows.map(r=>({...r, requestId:r.request_id, createdAt:r.created_at, tasks:r.tasks||[]}));
 };
 
 const persistJob = async (job) => {
   const t = JSON.stringify(job.tasks||[]);
   await pool.query(
     'INSERT INTO jobs (id, request_id, text, reply, status, created_at, tasks) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET reply=$4, status=$5, tasks=$7',
     [job.id, job.requestId, job.text, job.reply, job.status, job.createdAt, t]
   );
 };
 
 const jobs = await getJobs();
 for(const job of jobs) {
   if(['planning','working'].includes(job.status)){
     job.status='interrupted';
     job.reply='El servicio se reinició. Esta solicitud quedó interrumpida.';
     for(const task of job.tasks) if(['queued','working'].includes(task.status)) task.status='interrupted';
     await persistJob(job);
   }
 }
 
 async function execute(job,sectors){
  try{
  const areas = sectors.map(s => s.name);
  if (!areas.includes('Asistencia general')) areas.push('Asistencia general');
  const currentJobs = await getJobs();
  const previous=currentJobs.filter(j=>j.id!==job.id&&j.status==='done').slice(-4).map(j=>({user:j.text,reply:j.reply,results:j.tasks.map(t=>({area:t.area,result:t.result?.slice(0,2000)}))}));
  const plan=await runner(`Actúa como Jefe ION. Contexto confirmado de la empresa: ${JSON.stringify(companyProfile)}. Decide si debes responder directamente o delegar. Divide las peticiones en hasta 4 tareas. Si faltan datos pregunta. Marca needsExternalAction si necesita actuar fuera. Áreas: ${JSON.stringify(areas)}. Historial: ${JSON.stringify(previous)}. Petición: ${JSON.stringify(job.text)}`,planSchema);
  if(typeof plan.reply!=='string'||!Array.isArray(plan.tasks)||plan.tasks.length>4)throw Error('El jefe devolvió un reparto inválido.');
  job.reply=plan.reply;
  job.tasks=plan.tasks.map(t=>{
    const sector = sectors.find(s => s.name === t.area);
    const engine = sector ? (sector.agent || 'Gemini 2.5') : 'Gemini 2.5';
    return {id:randomUUID(),area:areas.includes(t.area)?t.area:'Asistencia general',instruction:t.instruction,needsExternalAction:t.needsExternalAction,worker:`Especialista de ${t.area}`,engine,status:'queued',result:null};
  });
  job.status=job.tasks.length?'working':'done';await persistJob(job);
  for(const task of job.tasks){
    task.status='working';await persistJob(job);
    try{
      if (['Claude Code', 'Hermes', 'ChatGPT / Codex', 'Antigravity', 'Arena'].includes(task.engine)) {
        task.result = await runCLI(task.engine, task.instruction, job.text);
      } else {
        task.result=await runner(`Tu rol es ${task.worker}. ION Group: ${JSON.stringify(companyProfile)}. Entrega el resultado, no una promesa. Si exige herramientas externas, entrega solo lo que puedas preparar y especifica la acción pendiente. No inventes. Instrucción: ${JSON.stringify(task.instruction)}. Contexto: ${JSON.stringify(job.text)}`);
      }
      if(typeof task.result!=='string')throw Error('Respuesta inválida');
      task.status=task.needsExternalAction?'draft':'done';
    }catch(e){
      task.status='error';task.result=e.message;
    }
    await persistJob(job);
  }
  job.status=job.tasks.some(t=>t.status==='error')?'partial':'done';await persistJob(job);
  }catch(e){job.status='error';job.reply=e.message;await persistJob(job);}finally{busy=false;}
 }
 
 return {state:async()=>{
  const currentJobs = await getJobs();
  return {busy,jobs:currentJobs,engine:'Gemini 2.5 + CLI Agents',capability:'Conexión directa al PC para Claude Code, Hermes y otros agentes locales'};
 },submit:async(text,requestId,sectors)=>{
  if(typeof text!=='string'||!text.trim()||text.length>4000||typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw Object.assign(Error('Escribe una petición válida.'),{status:400});
  const currentJobs = await getJobs();
  const existing=currentJobs.find(j=>j.requestId===requestId);if(existing)return existing;
  if(busy)throw Object.assign(Error('El equipo está trabajando. Espera a que termine esta solicitud.'),{status:409});
  busy=true;
  const job={id:randomUUID(),requestId,text:text.trim(),reply:'El jefe está organizando tu petición…',status:'planning',createdAt:new Date().toISOString(),tasks:[]};
  await persistJob(job);
  execute(job,sectors).catch(()=>{busy=false;});
  return job;
 }};
}
