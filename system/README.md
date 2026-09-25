# ION Group — Oficina ION 0.3

Panel interno de ION Group: oficina de sectores y agentes, Jefe ION, calendario, bandeja de clientes (WhatsApp, Instagram, Messenger, Discord) y placas NFC/QR. Node.js 22 sin framework y PostgreSQL.

## Arranque local

```
npm ci
cp .env.example .env        # completar DATABASE_URL como mínimo
npm start                   # http://127.0.0.1:4310
```

- Mientras no exista ningún usuario, el panel funciona sin login, pero **solo en localhost**.
- Para exigir login, crea el primer administrador (la contraseña se pide por teclado):

```
npm run user:create -- --email tu@correo.cl --name "Tu nombre"
```

Desde ese momento todo el panel exige sesión.

## Pruebas

```
DATABASE_URL=postgres://usuario@host/ion_test DATABASE_SSL=disable npm test
```

- Las pruebas vacían tablas. Por eso se niegan a ejecutarse si el nombre de la base no contiene `test`.
- No envían mensajes reales.
- La CI (`.github/workflows/ci.yml`) las ejecuta con un Postgres 16 en cada push.

## Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL. **Obligatoria.** |
| `DATABASE_SSL` | `disable` (local sin SSL), `verify` (valida el certificado) o vacío (SSL sin verificar; comportamiento anterior) |
| `GEMINI_API_KEY` | Motor del Jefe ION. Sin ella, el panel muestra "Motor sin configurar" |
| `PORT` | Por defecto 4310. El servidor escucha solo en 127.0.0.1 |
| `PUBLIC_ORIGIN` | URL exacta del panel si se publica por túnel o dominio (ej. `https://oficina.iongroup.cl`). Vacía = solo localhost |
| `NFC_PUBLIC_BASE` | Dominio de las placas (por defecto `https://iongroup.cl`) |
| `META_*`, `WHATSAPP_*`, `INSTAGRAM_*`, `FACEBOOK_*`, `DISCORD_*` | Canales. Ver `.env.example` |

No guardes secretos en el repositorio ni los pegues en chats.

## Seguridad

- **Autenticación:**
  - Contraseñas con scrypt.
  - Sesiones en Postgres; se guarda solo el hash del token.
  - Cookie HttpOnly con SameSite=Strict, y Secure fuera de localhost.
  - 10 intentos fallidos por IP y correo cada 15 minutos.
- **Roles:** `SUPERADMIN` y `TRABAJADOR` entran al panel interno. `ADMIN_CLIENTE` y `USUARIO` quedan reservados para los sistemas de clientes.
- **Host y origen:** solo se aceptan localhost o `PUBLIC_ORIGIN`. Un host no permitido recibe 421, lo que frena el DNS rebinding. Toda escritura exige una cabecera `Origin` permitida.
- **Rutas públicas:** solo `/webhooks/meta`, `/webhooks/discord`, `/nfc/*` y `/health`.
- **Cabeceras:** CSP con `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff` y `Referrer-Policy`.
- **Agentes CLI:**
  - Se ejecutan con `execFile` sin shell, con `--` antes del prompt, en un directorio temporal vacío y con un entorno mínimo sin credenciales.
  - Claude Code corre con `--tools ''` y Codex con `--sandbox read-only`.
  - **Hermes no documenta restricciones:** revisa sus permisos antes de asignarle un sector.

## Jefe ION

- `POST /api/manager`: Gemini 2.5 Flash reparte la petición en hasta 4 tareas por área.
- Cada tarea la ejecuta el agente asignado al sector: Claude Code, Codex o Hermes por CLI local. Si el sector no tiene agente, la ejecuta Gemini.
- Las acciones externas quedan como borrador: el sistema no envía ni publica por su cuenta.
- Al reiniciar el servidor, los trabajos en curso quedan como interrumpidos.
- Las CLI viven en el Mac (`~/.local/bin`); en un servidor sin ellas, esas tareas terminan con un error visible.

## Canales

- **Webhooks:** Meta y Discord, con firma verificada, aislamiento por cuenta y deduplicación.
- **Respuestas:** manuales y solo de texto, dentro de la ventana de 24 horas.
- **Registro previo del envío:** cada envío se guarda antes de contactar a Meta.
  - Una interrupción deja el envío como "incierto" y no se reintenta con el mismo ID.
  - "Aceptado" no significa entregado.
- **Meta** (WhatsApp, Instagram y Messenger): una aplicación compartida. Webhook HTTPS en `/webhooks/meta`.
- **Discord:** `/ion mensaje` desde usuarios permitidos. `npm run discord:register` registra el comando una vez.
  - Destino guardado: servidor de ion group, guild 1551996062380724305.
- **Estado:**
  - Instagram y Facebook: pendientes de identificar y autorizar.
  - WhatsApp: aplazado por indicación del propietario.

## Calendario

- Hora de Chile (`America/Santiago`) con horario de verano.
- Exportación `.ics` con aviso previo. No sincroniza con Apple.
- Los avisos web funcionan solo con la página abierta.

## Placas NFC/QR

- **Panel "NFC y QR":** crea placas con código propio (`iongroup.cl/nfc/[código]`), sus acciones y un destino editable sin reprogramar la placa. También permite activarlas o desactivarlas y descargar el QR en SVG.
- **Landing móvil:** muestra botones con la marca del cliente y "Desarrollado por ION GROUP", o redirige directo a una acción.
- **Analítica:** hoy, 7 días, 30 días y total, más clics por acción y tipo de dispositivo. **No se guarda IP ni user-agent**, y las vistas previas de apps no cuentan.

## Datos, migraciones y respaldos

- **Migraciones:** `migrations/NNN_*.sql` se aplican al arrancar, una vez cada una, en transacción, y quedan registradas en `schema_migrations`. Solo se aceptan cambios aditivos.
- **Respaldo:** `npm run db:backup` (con `BACKUP_DIR`) genera un `pg_dump` verificado con sha256. Retención: 7 diarios, 4 semanales y 6 mensuales.
- **Prueba de restauración:** `npm run db:restore-test -- archivo.dump [DATABASE_URL_origen]` restaura en una base temporal, compara conteos y la borra.

## Despliegue

Ver `../docs/DESPLIEGUE.md`: Caddy con HTTPS, systemd por entorno y `deploy/deploy.sh` con health check y rollback.

## Estado real

- **Funciona y está probado:** oficina, tareas, calendario, bandeja, autenticación, NFC, migraciones, respaldos y deploy con rollback. Se probó en local y en CI.
- **No verificado aún:** la respuesta real completa del Jefe ION con cada motor, y los canales con cuentas autorizadas.
- **No desplegado:** el servidor 62.238.117.110 no se ha auditado (ver `../docs/AUDITORIA.md`).
