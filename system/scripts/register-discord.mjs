import {loadEnvFile} from 'node:process';
try{loadEnvFile();}catch(e){if(e.code!=='ENOENT')throw e;}
const {DISCORD_APPLICATION_ID:app,DISCORD_GUILD_ID:guild,DISCORD_BOT_TOKEN:token}=process.env;
if(!app||!guild||!token)throw Error('Completa las variables DISCORD_APPLICATION_ID, DISCORD_GUILD_ID y DISCORD_BOT_TOKEN en .env');
const response=await fetch(`https://discord.com/api/v10/applications/${encodeURIComponent(app)}/guilds/${encodeURIComponent(guild)}/commands`,{method:'POST',headers:{Authorization:`Bot ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name:'ion',description:'Envía una instrucción a la bandeja de ION Group',type:1,options:[{name:'mensaje',description:'Instrucción para el equipo',type:3,required:true,max_length:2000}]})});
if(!response.ok)throw Error(`Discord rechazó el registro (${response.status}). Revisa la aplicación y sus permisos.`);
console.log('Comando /ion registrado. Configura el endpoint HTTPS /webhooks/discord y los usuarios permitidos.');
