(() => {
 const summary=document.getElementById('connectionSummary'),inbox=document.getElementById('inbox');
 const names={facebook:'Facebook Messenger',whatsapp:'WhatsApp Business',instagram:'Instagram',discord:'Discord'};
 const node=(tag,text,cls)=>{const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e};
 let busy=false;
 async function refreshChannels(){
  if(busy)return;
  try{
   const [statusResponse,inboxResponse]=await Promise.all([fetch('/api/integrations'),fetch('/api/inbox')]);
   if(!statusResponse.ok||!inboxResponse.ok)throw Error('No se pudo cargar la conexión con los canales');
   const status=await statusResponse.json(),{messages}=await inboxResponse.json();
   summary.replaceChildren(node('h2','Estado real de las integraciones'));
   const list=node('ul','');for(const [key,value]of Object.entries(status)){list.append(node('li',`${names[key]}: ${value.configured?'credenciales configuradas; activación externa pendiente':'pendiente de credenciales'}${value.lastReceived?' · Última recepción: '+new Date(value.lastReceived).toLocaleString('es-CL'):''}`));}
   summary.append(list,node('p','El logo y el panel ya están listos. Para recibir mensajes, hay que autorizar tus cuentas y configurar la dirección HTTPS de recepción. Las respuestas desde esta bandeja son manuales.'));
   const drafts=new Map([...inbox.querySelectorAll('textarea')].map(e=>[e.dataset.thread,e.value]));
   const groups=new Map();for(const message of messages){const key=message.channel+':'+message.sender;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(message);}
   inbox.hidden=groups.size===0;document.getElementById('inboxEmpty').hidden=groups.size>0;
   inbox.replaceChildren(node('h2','Bandeja de conversaciones'));
   for(const [key,thread]of groups){const last=thread.filter(m=>m.direction==='in').at(-1);if(!last)continue;const section=node('section','','conversation');section.append(node('h3',`${names[last.channel]} · ${last.sender}`));
    for(const message of thread){const item=node('div',message.text,'message'+(message.direction==='out'?' out':''));const statusLabel={accepted:'Aceptado por el canal',failed:'Rechazado por el canal',sending:'Enviando',unknown:'Envío sin confirmar: revisar en el canal',received:'Recibido'}[message.status]||message.status;item.prepend(node('small',`${message.direction==='out'?'ION Group':'Cliente / usuario'} · ${statusLabel} · ${new Date(message.timestamp).toLocaleString('es-CL')}`));section.append(item);}
    if(last.channel!=='discord'){
     const form=node('form','','reply-form'),text=node('textarea',''),button=node('button','Enviar respuesta','primary');text.setAttribute('aria-label','Respuesta para '+last.sender);text.placeholder='Escribe la respuesta que recibirá este cliente';text.required=true;text.maxLength=2000;text.dataset.thread=key;text.value=drafts.get(key)||'';button.disabled=!status[last.channel].configured;form.append(text,button);form.onsubmit=async event=>{event.preventDefault();busy=true;button.disabled=true;const requestId=crypto.randomUUID();try{const response=await fetch('/api/reply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messageId:last.id,text:text.value,requestId})});const data=await response.json();if(!response.ok)throw Error(data.error);text.value='';notify('El canal aceptó la respuesta. Esto no confirma su lectura.');}catch(error){notify(error.message);}finally{busy=false;await refreshChannels()}};section.append(form);
    }else section.append(node('p','Instrucción recibida por /ion. Responde en Discord; la ejecución por agentes sigue pendiente.'));
    inbox.append(section);
   }
  }catch(e){summary.replaceChildren(node('p',e.message));}
 }
 refreshChannels();setInterval(()=>{if(!document.hidden&&!document.getElementById('channelsView').hidden&&!inbox.contains(document.activeElement))refreshChannels()},15000);
})();
