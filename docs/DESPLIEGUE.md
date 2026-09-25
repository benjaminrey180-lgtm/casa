# Despliegue de ION GROUP

Objetivo: Git → tests → deploy → health check → producción, con rollback y entornos separados.

```
Internet → DNS (iongroup.cl, subdominios) → Caddy (HTTPS automático)
   ├─ iongroup.cl            → web estática (/srv/ion/web/current)
   │    ├─ /nfc/*            → Oficina ION 127.0.0.1:4310
   │    └─ /webhooks/*       → Oficina ION 127.0.0.1:4310
   ├─ oficina.iongroup.cl    → Oficina ION 127.0.0.1:4310 (opcional, con login)
   ├─ staging.iongroup.cl    → Oficina ION 127.0.0.1:4311 (noindex)
   └─ duo./capitalbarber./goldenroll.iongroup.cl → sistemas de clientes (sin cambios hasta auditar)
PostgreSQL: solo en localhost o red privada; nunca expuesto a Internet.
```

## 0. Antes de tocar el servidor (obligatorio)

Hoy el servidor 62.238.117.110 atiende iongroup.cl y los tres subdominios de clientes. Antes de cambiar nada:

1. **Inventario.** En el servidor ejecuta:
   ```
   uname -a; cat /etc/os-release
   ss -ltnp
   systemctl list-units --type=service --state=running
   ls /etc/nginx/sites-enabled /etc/apache2/sites-enabled /etc/caddy 2>/dev/null
   certbot certificates 2>/dev/null
   crontab -l; ls /etc/cron.d
   df -h; free -h
   ```
2. **Configuración actual.** Copia la configuración del proxy (nginx, apache o caddy) y los certificados a `deploy/legacy/`, sin claves privadas en Git.
3. **Documentación.** Anota qué aplicación, puerto y base de datos atiende cada subdominio.
4. **Respaldo.** Respalda las bases de datos existentes **antes** de cualquier cambio y prueba restaurarlas.
5. **Error SSL.** El LEEME registró un error SSL en iongroup.cl. Revisa si el certificado venció o si falta la cadena intermedia (`openssl s_client -connect iongroup.cl:443 -servername iongroup.cl`).

## 1. Preparación del servidor

```
sudo useradd --system --create-home --home-dir /srv/ion ion
sudo mkdir -p /srv/ion/{production,staging}/backups /etc/ion
sudo chown -R ion:ion /srv/ion
# Node 22, PostgreSQL 16 y Caddy desde sus repositorios oficiales.
sudo -u postgres createuser ion_prod --pwprompt
sudo -u postgres createdb -O ion_prod ion_production
sudo -u postgres createuser ion_stg --pwprompt
sudo -u postgres createdb -O ion_stg ion_staging
```

Crea `/etc/ion/production.env` y `/etc/ion/staging.env` con permisos 600 y dueño `ion`, a partir de `system/.env.example`.
- **Producción:** `PORT=4310`.
- **Staging:** `PORT=4311`, con otra base y **sin credenciales reales de canales**.

```
sudo cp deploy/ion-office@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # solo tras el paso 0
sudo systemctl reload caddy
```

## 2. Desplegar

```
sudo -u ion deploy/deploy.sh staging <commit>      # primero staging
curl -s https://staging.iongroup.cl/health
sudo -u ion deploy/deploy.sh production <commit>
```

`deploy.sh` hace lo siguiente:
1. Clona el commit en un release nuevo e instala las dependencias.
2. En producción, respalda la base.
3. Cambia el symlink `current` de forma atómica y reinicia el servicio.
4. Exige que `/health` responda `ok` **con ese mismo commit**.
5. Si falla, vuelve solo a la versión anterior.
6. Conserva los últimos 5 releases.

Rollback manual:
```
ln -sfn /srv/ion/production/releases/<release-anterior> /srv/ion/production/current
sudo systemctl restart ion-office@production
```

Nunca se despliega a producción un commit con la CI en rojo. Primero staging, después producción.

## 3. Respaldos automáticos

```
# crontab del usuario ion
15 3 * * *  cd /srv/ion/production/current/system && DATABASE_URL=... BACKUP_DIR=/srv/ion/production/backups ./scripts/backup.sh >> /srv/ion/production/backups/backup.log 2>&1
# Prueba de restauración semanal
45 3 * * 0  cd /srv/ion/production/current/system && ADMIN_URL=... ./scripts/restore-test.sh "$(ls -1 /srv/ion/production/backups/daily/*.dump | tail -1)" "$DATABASE_URL" >> /srv/ion/production/backups/restore.log 2>&1
```

Copia los respaldos **fuera del servidor**, por ejemplo con rclone a un almacenamiento externo. Un respaldo que solo vive en el mismo disco no protege contra la pérdida del servidor.

## 4. Monitoreo

- `/health` de cada entorno responde el estado de la app, la base de datos, la versión y la revisión desplegada.
- Recomendación: un monitor externo gratuito (por ejemplo UptimeRobot o Better Stack) sobre:
  - `https://iongroup.cl/`
  - la URL de una placa NFC de prueba
  - `/health` de cada sistema de cliente, cuando lo tengan
- Logs: `journalctl -u ion-office@production -f`. Los errores internos se registran en el log y no se muestran en la API.
