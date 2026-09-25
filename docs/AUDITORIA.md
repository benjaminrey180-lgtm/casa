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

### Pendientes (ver la revisión cruzada en §6)
- **El panel expuesto por el túnel no tiene autenticación.** Cualquiera con la URL lee la bandeja de clientes y puede responder a nombre de ION. Es el riesgo más alto que queda.
- No hay migraciones versionadas ni respaldos automáticos de la base.
- La web pública está incompleta en el repo y el sitio responde con error SSL.
- La página NFC es estática: no permite cambiar el destino ni registra estadísticas.

## 5. Plan priorizado (Fase B)

Las dependencias se indican con →.

**P0 — Seguridad y operación (antes de exponer nada)**
1. Autenticación del panel: sesiones con cookie HttpOnly y roles SUPERADMIN, ADMIN CLIENTE, TRABAJADOR y USUARIO. Mientras tanto, **no usar el túnel pinggy** o protegerlo con contraseña.
2. Migraciones versionadas (`migrations/NNN_*.sql` + tabla `schema_migrations`), solo aditivas.
3. Respaldos: `pg_dump` diario con retención (7 diarios, 4 semanales, 6 mensuales), copia fuera del servidor y **prueba de restauración** documentada.
4. Auditoría del servidor 62.238.117.110. Necesita acceso SSH o que el dueño comparta la configuración: nginx/caddy, certbot, servicios, puertos, firewall.

**P1 — Producto**
5. Módulo NFC/QR dinámico: `iongroup.cl/nfc/[codigo]` con destino editable, activo/inactivo y analítica sin datos personales (depende de 1 y 2).
6. Web iongroup.cl: recuperar CSS/JS/imágenes del servidor, corregir SEO técnico, agregar JSON-LD, sitemap y robots, y crear páginas `/proyectos/[slug]`.
7. Registro central de clientes (tenants): nombre, subdominio, sistema, estado, mensualidad y módulos. Alimenta el sitemap, el portafolio, el NFC y el monitoreo.

**P2 — Plataforma**
8. Deploy: Git → tests → build → deploy → health check, con entornos development, staging y production y rollback al release anterior.
9. Monitoreo: comprobar `/health` de cada subdominio de cliente, con alertas.
10. PWA del panel: manifest, íconos y service worker **sin cachear datos de clientes**.
11. Búsqueda interna con tolerancia a errores (normalizar tildes, trigramas con `pg_trgm`).
12. Panel SEO (el punto 28 del prompt maestro llegó cortado).

### Qué necesita el dueño (bloqueos reales)
- Acceso al servidor 62.238.117.110, o su configuración: reverse proxy, certificados y servicios.
- Los archivos faltantes del sitio: `css/styles.css`, `js/main.js` e `img/*`.
- El código o repositorio de los sistemas de Dúo, Capital Barber, Golden Roll y Vega Barrón.
- Datos verificados de cada cliente para SEO local: dirección, comuna, horarios, teléfono, enlace de Google Business Profile y autorización para publicarlos.
- Cómo invocar Hermes y Antigravity y qué permisos tienen. Esta sesión en la nube no puede ejecutarlos.
- El texto completo del punto 28 en adelante del prompt maestro.

## 6. Revisión cruzada (Fase D)

Ver `docs/REVISION.md`.
