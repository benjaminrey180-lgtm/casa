#!/usr/bin/env bash
# Respaldo de la base de Oficina ION con verificación y retención.
# Uso: DATABASE_URL=... BACKUP_DIR=/var/backups/ion scripts/backup.sh
# Retención: 7 diarios, 4 semanales (domingo), 6 mensuales (día 1).
# Programar con cron, por ejemplo:  15 3 * * *  cd /srv/ion/system && ./scripts/backup.sh >> /var/log/ion-backup.log 2>&1
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly}
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/daily/ion-$stamp.dump"

# Formato custom: comprimido y restaurable por tabla con pg_restore.
pg_dump --format=custom --no-owner --no-privileges --file="$file.partial" "$DATABASE_URL"
# Verificación mínima: el archivo se puede leer y contiene tablas.
tables="$(pg_restore --list "$file.partial" | grep -c ' TABLE ' || true)"
if [ "$tables" -lt 1 ]; then echo "ERROR: respaldo sin tablas: $file" >&2; rm -f "$file.partial"; exit 1; fi
mv "$file.partial" "$file"
sha256sum "$file" > "$file.sha256"
chmod 600 "$file" "$file.sha256"

if [ "$(date -u +%u)" = 7 ]; then cp "$file" "$file.sha256" "$BACKUP_DIR/weekly/"; fi
if [ "$(date -u +%d)" = 01 ]; then cp "$file" "$file.sha256" "$BACKUP_DIR/monthly/"; fi

# Conserva los N más recientes (los nombres llevan fecha UTC, así que el orden alfabético es cronológico).
prune() { find "$1" -maxdepth 1 -name '*.dump' | sort -r | tail -n +"$(($2 + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; done; }
prune "$BACKUP_DIR/daily" 7
prune "$BACKUP_DIR/weekly" 4
prune "$BACKUP_DIR/monthly" 6
echo "OK $file ($tables tablas, $(du -h "$file" | cut -f1))"
