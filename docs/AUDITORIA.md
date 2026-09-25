# ION GROUP — Auditoría del ecosistema (Fase A) y plan (Fase B)

Fecha: 2026-09-25. Alcance: el paquete entregado (web pública, Oficina ION y página NFC) y lo que se puede ver desde fuera (DNS).
No se tuvo acceso al servidor, al proveedor DNS, a la base de datos de producción ni al código de los sistemas de clientes.

## 1. Qué existe

| Pieza | Ubicación | Tecnología | Estado verificado |
|---|---|---|---|
| Web pública iongroup.cl | `web/index.html` | HTML estático + `css/styles.css`, `js/main.js`, `img/*` | Incompleta en el repo: faltan CSS, JS e imágenes. No se pudo comparar con producción. |
| Oficina ION (panel interno) | `system/` | Node 22 sin framework, PostgreSQL (`pg`), Gemini (`@google/genai`) | Funciona localmente con Postgres (probado de punta a punta). |
| Página NFC | `nfc/nfc.html` (= `system/public/nfc.html`) | HTML estático | Estática: enlaces fijos a la web y a Instagram. |
| Sistemas de clientes (Dúo, Capital Barber, Golden Roll, Vega Barrón) | No incluidos | Desconocida | Solo se ven desde el DNS (ver §3). |

### Arquitectura de Oficina ION

```
Navegador (127.0.0.1:4310 o túnel *.pinggy.net)
  └─ server.mjs (router HTTP único)
       ├─ /                       estáticos de public/ (lista cerrada)
       ├─ /health, /api/health    estado + ping a la BD            [nuevo]
       ├─ /api/state|tasks|sectors|assign   oficina (tabla sectors, tasks)
       ├─ /api/calendar[/status|/export]    calendar.mjs (tabla events, .ics)
       ├─ /api/manager            manager.mjs → Gemini 2.5 Flash (plan)
       │                             └─ execFile: claude / codex / hermes (trabajadores)
       ├─ /api/inbox, /api/reply, /api/integrations   integrations.mjs → Graph API Meta
       └─ /webhooks/meta, /webhooks/discord           firmas HMAC / Ed25519
  └─ db.mjs → PostgreSQL (DATABASE_URL)  tablas: events, tasks, sectors, inbox, jobs
```

Variables de entorno: `DATABASE_URL`, `DATABASE_SSL`, `GEMINI_API_KEY`, `PORT`, `META_*`, `WHATSAPP_*`, `INSTAGRAM_*`, `FACEBOOK_*`, `DISCORD_*` (ver `system/.env.example`).

### El README y el código no coinciden

El README describe la versión anterior (JSON en `data/`, motor solo Claude Code, sin herramientas). El código actual:
- guarda todo en **PostgreSQL**, sin migraciones versionadas: `CREATE TABLE IF NOT EXISTS` al arrancar;
- planifica con **Gemini 2.5 Flash** y ejecuta trabajadores con las CLI locales `claude`, `codex` y `hermes` según el agente asignado al sector.

## 2. Inventario de agentes

| Agente | Función en el sistema | Modelo / motor | Herramientas | Permisos | Estado |
|---|---|---|---|---|---|
| Jefe ION | Divide peticiones en ≤4 tareas por área | Gemini 2.5 Flash (API) | Ninguna (salida JSON) | Sin acceso externo | Requiere `GEMINI_API_KEY` |
| Trabajador "Gemini 2.5" | Sectores sin agente asignado | Gemini 2.5 Flash | Ninguna | — | Operativo con clave |
| Claude Code | Sectores asignados a "Claude Code", "Antigravity" o "Arena" | CLI `~/.local/bin/claude -p` | **Antes:** todas. **Ahora:** sin Bash/Edit/Write/Web | Lectura del directorio del servicio | Depende del Mac y de la cuota (se registró un HTTP 429) |
| Codex | Sectores "ChatGPT / Codex" | CLI `codex exec` | **Ahora:** `--sandbox read-only` | Lectura | Depende del Mac |
| Hermes | Sectores "Hermes" | CLI `hermes` | Desconocidas: no hay documentación en el paquete | Desconocidos | Depende del Mac. **Revisar sus permisos.** |
| Antigravity | Coordinador según el prompt maestro | En el código se ejecuta como `claude -p` | — | — | No existe un adaptador real |
| Arena (Golden Roll) | Conversación web vinculada | Web arena.ai | — | — | Solo enlace; se ejecuta como `claude -p` |

Costo: no hay registro de consumo por agente. Pendiente: guardar tokens y tiempo por tarea en la tabla `jobs`.

## 3. Dominios (verificado por DNS público el 2026-09-25)

| Host | Resuelve a | Observación |
|---|---|---|
| iongroup.cl, www.iongroup.cl | 62.238.117.110 | Web corporativa. El LEEME registra un error SSL al intentar recuperarla. |
| duo.iongroup.cl | 62.238.117.110 | Existe |
| capitalbarber.iongroup.cl | 62.238.117.110 | Existe |
| goldenroll.iongroup.cl | 62.238.117.110 | Existe |
| (subdominio inexistente) | no resuelve | **No hay comodín**: cada subdominio se creó a mano |

Conclusión: todo apunta a **un único servidor**. Es un punto único de falla, y por la cadena de certificados probablemente también es el origen del error SSL. Desde este entorno no se pudo abrir HTTPS (la red lo bloquea), así que queda por verificar: proveedor, sistema operativo, reverse proxy, certificados y qué aplicación responde en cada subdominio.

## 4. Problemas encontrados

### Corregidos en esta rama
| # | Severidad | Problema | Arreglo |
|---|---|---|---|
| 1 | Crítica | `runCLI` armaba un comando de bash con texto del usuario y del modelo. El escape no cubría `\`, lo que permitía **ejecución remota de comandos** en el Mac. Además `claude -p` corría con todas sus herramientas. | `execFile` sin shell; Claude sin herramientas de escritura/red; Codex en sandbox de solo lectura |
| 2 | Alta | El filtro de origen usaba `includes('localhost')`, así que `http://localhost.atacante.com` pasaba | `security.mjs`: hostname exacto; pinggy solo por HTTPS |
| 3 | Alta | 8 de 11 pruebas fallaban: estaban escritas para la versión JSON | Pruebas reescritas contra Postgres (15/15), con protección para no tocar la base real |
| 4 | Media | Postgres obligaba a SSL sin verificar el certificado | `DATABASE_SSL=disable|verify`; sin valor se mantiene el comportamiento anterior |
| 5 | Media | Sin health checks | `/health` y `/api/health` con ping a la BD |
| 6 | Baja | El panel decía "Motor: Claude Code" aunque el motor es Gemini | El texto sale del servidor |

### Estado del plan (Fase F, 2026-09-25)

| Prioridad | Punto | Estado |
|---|---|---|
| P0 | Autenticación, sesiones y roles | ✅ Hecho y probado (unitarias + de punta a punta + revisión cruzada) |
| P0 | Migraciones versionadas | ✅ `migrations/`, `schema_migrations`, verificación de esquema |
| P0 | Respaldos con prueba de restauración | ✅ `backup.sh` + `restore-test.sh` probados; falta programarlos en el servidor |
| P0 | Auditoría del servidor 62.238.117.110 | ⛔ Bloqueado: requiere acceso (checklist en `DESPLIEGUE.md` §0) |
| P1 | Módulo NFC/QR con analítica | ✅ Panel, landing, QR, estadísticas sin datos personales |
| P1 | Web: SEO técnico, portafolio y categorías | ✅ Metadatos, JSON-LD, sitemap, robots, 404 y 7 páginas generadas. ⚠️ Faltan CSS, JS e imágenes originales del sitio |
| P1 | Registro central de clientes | ✅ Cartera con estado en línea y mensualidades |
| P2 | CI, deploy con rollback y staging | ✅ CI en GitHub Actions; `deploy.sh` probado con rollback; Caddy probado. Falta instalarlo en el servidor |
| P2 | Monitoreo | ✅ `/health` + chequeo de clientes cada 10 min. Falta un monitor externo |
| P2 | PWA del panel | ✅ Manifest e íconos (sin service worker, a propósito) |
| P2 | Búsqueda tolerante | ✅ Sin tildes, parcial, errores pequeños y sinónimos |
| P2 | Panel SEO (punto 28) | ⛔ El prompt llegó cortado en ese punto |
| — | SEO local de clientes y Google Business Profile | 📋 Guía y datos a pedir en `SEO-LOCAL.md`; faltan los datos reales de cada cliente |

### Riesgos que siguen abiertos
- **Hermes** se ejecuta sin restricciones conocidas, y **Codex** en modo solo lectura puede leer todo el disco. Para sectores con esos agentes, conviene ejecutarlos con un usuario del sistema aislado.
- **Multi-cliente:** los datos todavía no se filtran por `tenant`. Antes de abrir el panel a `ADMIN_CLIENTE` hay que agregar ese filtro en NFC y en la cartera.
- **Túnel pinggy:** con usuarios creados, el panel exige login; aun así, lo recomendable es `oficina.iongroup.cl` con HTTPS propio.
- **La web en el repo no está completa.** Antes de desplegarla hay que recuperar `css/styles.css`, `js/main.js` e `img/*` desde el servidor, para no publicar un sitio sin estilos.

## 6. Revisión cruzada (Fase D)

Cuatro agentes revisores independientes (Claude): seguridad, QA/móvil, SEO y una segunda ronda sobre el código nuevo. Sus hallazgos, con el detalle de cada corrección, están en los mensajes de commit del PR. Todos los críticos, altos y medios quedaron corregidos y verificados. Los bajos que se dejaron pendientes aparecen en "Riesgos que siguen abiertos".

Codex, Hermes y Antigravity no se pudieron usar como revisores porque viven en el Mac del dueño, fuera de esta sesión en la nube.
