# ION Group — Oficina de agentes 0.3

Oficina local con el logo original de ION Group, identidad blanco/negro, sectores editables, asignaciones, tareas y bandeja de canales. Inspiración visual: https://github.com/pixel-agents-hq/pixel-agents. Implementación independiente.

## Arranque

Node.js 22 o superior. Ejecutar `npm start` y abrir http://127.0.0.1:4310. `npm test` ejecuta las pruebas de integración aisladas, sin enviar mensajes reales. Datos en `data/`, excluidos de Git. El logo original está en `public/assets/ion-group-logo.jpeg`.

## Estado real

- Funcionan el plano, la creación de sectores, las asignaciones y el registro persistente de tareas.
- Los agentes todavía no ejecutan las tareas ni informan actividad en vivo. Arena tiene acceso web a la conversación indicada por el propietario.
- Implementados receptores de Meta y Discord con comprobación de firmas, aislamiento por cuenta/servidor y deduplicación persistente.
- Implementada la bandeja de mensajes entrantes y respuestas manuales de texto para WhatsApp Cloud API e Instagram API con Instagram Login. Requiere credenciales y configuración externa. No hay clientes ni mensajes de demostración.
- Discord recibe `/ion mensaje` de usuarios permitidos y confirma su recepción de manera privada. No ejecuta tareas ni responde mediante IA. El script de registro no se ejecuta al iniciar.
- Los envíos se registran antes de contactar con Meta y evitan duplicación con el mismo identificador. Una interrupción queda como estado incierto; no se reintenta automáticamente. “Aceptado” no significa entregado ni leído.
- Se permite respuesta de texto solo dentro de las 24 horas desde el último mensaje del cliente. No se implementan plantillas, campañas, adjuntos ni automatización de respuestas.
- No está desplegado ni funciona 24/7. El servicio local depende de este Mac.

## Activar cuentas

Copiar `.env.example` a `.env`, completar los valores localmente y reiniciar. No guardar secretos en el repositorio ni pegarlos en chats. `META_API_VERSION` debe ser la versión habilitada para la aplicación de Meta. Esta implementación usa una aplicación Meta compartida por WhatsApp e Instagram; aplicaciones distintas requieren secretos separados y otro ajuste.

### WhatsApp e Instagram

1. Identificar las cuentas empresariales de ION Group y autorizar su aplicación de Meta con permisos de mensajería.
2. Configurar token, secreto de aplicación, token de verificación e identificadores en `.env`.
3. Configurar el webhook público HTTPS `/webhooks/meta` y suscribirse a los eventos de mensajes de las cuentas correspondientes.
4. Enviar un mensaje de prueba desde una cuenta autorizada y comprobar que aparece en la bandeja. Responder desde el panel y verificar el resultado en el canal.

El receptor ignora mensajes de otras cuentas, ecos y eventos que no son mensajes. El contenido multimedia se muestra como aviso para revisarlo en la aplicación original.

### Discord

1. Crear la aplicación/bot de ION Group y autorizarla en el servidor elegido con el alcance de comandos.
2. Completar `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID`, `DISCORD_ALLOWED_USER_IDS` (separados por comas), `DISCORD_APPLICATION_ID` y `DISCORD_BOT_TOKEN`.
3. Configurar `/webhooks/discord` como endpoint público HTTPS de interacciones. El receptor verifica Ed25519 y una antigüedad máxima de cinco minutos.
4. Ejecutar `npm run discord:register` una vez para registrar `/ion`; registra únicamente ese comando sin reemplazar los demás.
5. Probar `/ion mensaje:...` desde un usuario permitido. Se guarda en la bandeja, sin iniciar un agente.

## Antes de un despliegue permanente

El panel escucha únicamente en `127.0.0.1`. Exponer solamente los dos endpoints de webhooks mediante un proxy HTTPS; nunca todo el puerto sin autenticación. Las rutas del panel rechazan hosts ajenos, cabeceras de proxy y escrituras de otro origen. Para acceso remoto al panel falta autenticación de usuarios, sesiones y roles. También faltan despliegue supervisado, copias de seguridad, límites de almacenamiento, monitorización, adaptadores de agentes y pruebas reales con las cuentas autorizadas. No se ha configurado un dominio ni un servidor externo.

## Referencias oficiales

- WhatsApp Cloud API: https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- Instagram: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Validación de Meta: https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/
- Discord: https://docs.discord.com/developers/interactions/receiving-and-responding

No se han modificado las configuraciones ni credenciales existentes de OpenClaw o Hermes.

## Jefe ION

El despacho del jefe abre un chat persistente. `POST /api/manager` acepta peticiones locales; el jefe propone hasta cuatro tareas y ejecuta trabajadores de texto secuencialmente mediante Claude Code. Las áreas se toman de la oficina, con Asistencia general como alternativa. Los trabajadores son roles internos del mismo motor, no sesiones de Hermes, Arena o Antigravity. Los resultados que requieren actuar en servicios externos quedan como borradores.

El ejecutor desactiva herramientas, hooks, MCP y habilidades. No se pasan credenciales de canales al prompt. Se conserva un historial acotado como contexto; la bitácora completa queda en `data/manager.json`. Una petición en curso se rechaza hasta que termine la anterior; los identificadores evitan repetir la misma petición. Al reiniciar, las solicitudes activas quedan interrumpidas sin relanzarse.

La prueba real del motor encontró un límite semanal de Claude Code (HTTP 429). El flujo de delegación se validó con un motor simulado en pruebas; no se ha verificado todavía una respuesta real completa del jefe y sus trabajadores. Hace falta restablecer ese límite o integrar un motor alternativo disponible.

## Agenda, identidad empresarial y móvil

Calendario mensual con creación/edición, categoría, cliente/proyecto, notas, estado completado y aviso previo. Los datos se guardan en `data/calendar.json`. Horario explícito de Chile (`America/Santiago`), convertido a UTC incluyendo horario estacional. Exportación individual `.ics` de una hora con `VALARM`; no hay sincronización con Apple ni invitaciones a clientes. Los avisos en la web requieren tenerla abierta y ver Calendario; no hay push en segundo plano.

La interfaz usa navegación superior y controles táctiles hasta 760 px, campos de 16 px para evitar zoom al escribir y márgenes para el área segura. Probada a 390 px sin desbordamiento horizontal. Esto no habilita acceso desde otro dispositivo: sigue pendiente acceso remoto autenticado y alojamiento permanente.

Animación decorativa de personajes, iluminación y selección; respeta `prefers-reduced-motion`. No representa actividad real del motor. El perfil empresarial confirmado se conserva en `docs/empresa.md` y `companyProfile` en `calendar.mjs`, y se incorpora en los prompts del jefe y trabajadores. Estatutos pendientes de recibir.

### Facebook Messenger y servidor Discord elegido

Añadido adaptador de texto para Facebook Messenger: `FACEBOOK_PAGE_ID` y `FACEBOOK_PAGE_TOKEN`, misma aplicación Meta y endpoint `/webhooks/meta` con eventos de tipo `page`. Incluye aislamiento por página, recepción deduplicada y respuestas manuales de tipo RESPONSE dentro de la ventana admitida. Falta identificar y autorizar la página real. Referencia oficial: https://www.postman.com/meta/messenger-platform-api/documentation/iyp204x/messenger-platform-api

Invitación Discord proporcionada por el propietario y comprobada: https://discord.gg/9kurvVwBg — Servidor de ion group, canal general, guild 1551996062380724305. Guardado como destino; el bot todavía no se ha instalado ni autenticado. No se ha enviado ningún mensaje real. Instagram y Facebook pendientes de identificar y autorizar; WhatsApp aplazado por indicación del propietario.
