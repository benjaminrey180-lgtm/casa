// Crea un usuario del panel. Uso: npm run user:create -- --email a@b.cl --name "Nombre" [--role SUPERADMIN]
// La contraseña se pide por teclado (sin eco) o se lee de ION_PASSWORD. Nunca se pasa como argumento.
import {parseArgs} from 'node:util';
import {createInterface} from 'node:readline';
import {ROLES} from '../auth.mjs';
const {values} = parseArgs({options: {email: {type: 'string'}, name: {type: 'string'}, role: {type: 'string', default: 'SUPERADMIN'}, tenant: {type: 'string'}}});
if (!values.email || !values.name) { console.error('Uso: npm run user:create -- --email correo --name "Nombre" [--role ' + ROLES.join('|') + ']'); process.exit(1); }
async function ask(question) {
 if (process.env.ION_PASSWORD) return process.env.ION_PASSWORD;
 const rl = createInterface({input: process.stdin, output: process.stdout, terminal: true});
 rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); };
 const answer = await new Promise(resolve => rl.question(question, resolve));
 rl.close(); process.stdout.write('\n'); return answer;
}
const {pool, initDB} = await import('../db.mjs');
const {initAuth, createUser} = await import('../auth.mjs');
try {
 await initDB(); await initAuth();
 const password = await ask('Contraseña (mínimo 12 caracteres): ');
 const user = await createUser({email: values.email, name: values.name, role: values.role, tenant: values.tenant || null, password});
 console.log(`Usuario creado: ${user.email} (${user.role})`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await pool.end(); }
