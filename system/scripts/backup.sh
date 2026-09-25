#!/usr/bin/env bash
# Respaldo de la base de Oficina ION con verificación y retención.
# Uso: DATABASE_URL=... BACKUP_DIR=/srv/ion/production/backups scripts/backup.sh
# Retención: 7 diarios, 4 semanales (domingo), 6 mensuales (día 1).
# Programar con cron, por ejemplo:  15 3 * * *  cd /srv/ion/system && ./scripts/backup.sh >> /var/log/ion-backup.log 2>&1
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL}"
# Obligatorio y fuera del release (los releases se borran al desplegar).
: "${BACKUP_DIR:?Define BACKUP_DIR, p. ej. /srv/ion/production/backups}"
# La contraseña no va en la línea de comandos (se vería en ps): se pasa por PGPASSWORD.
split_password() {
  if [[ "$1" =~ ^(postgres(ql)?://[^:/@]+):([^@]*)@(.*)$ ]]; then
    local raw="${BASH_REMATCH[3]}"
    PGPASSWORD="$(printf '%b' "${raw//%/\\x}")"; export PGPASSWORD
    printf '%s@%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[4]}"
  else printf '%s' "$1"; fi
}
db_url="$(split_password "$DATABASE_URL")"
mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly}
chmod 700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/daily/ion-$stamp.dump"

# Formato custom: comprimido y restaurable por tabla con pg_restore.
pg_dump --format=custom --no-owner --no-privileges --file="$file.partial" "$db_url"
# Verificación mínima: el archivo se puede leer y contiene tablas.
tables="$(pg_restore --list "$file.partial" | grep -c ' TABLE ' || true)"
if [ "$tables" -lt 1 ]; then echo "ERROR: respaldo sin tablas: $file" >&2; rm -f "$file.partial"; exit 1; fi
mv "$file.partial" "$file"
# Suma con nombre relativo: sigue siendo válida en las copias semanales y mensuales.
(cd "$(dirname "$file")" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
chmod 600 "$file" "$file.sha256"

if [ "$(date -u +%u)" = 7 ]; then cp "$file" "$file.sha256" "$BACKUP_DIR/weekly/"; fi
if [ "$(date -u +%d)" = 01 ]; then cp "$file" "$file.sha256" "$BACKUP_DIR/monthly/"; fi

# Conserva los N más recientes (los nombres llevan fecha UTC, así que el orden alfabético es cronológico).
prune() { find "$1" -maxdepth 1 -name '*.dump' | sort -r | tail -n +"$(($2 + 1))" | while read -r old; do rm -f "$old" "$old.sha256"; done; }
prune "$BACKUP_DIR/daily" 7
prune "$BACKUP_DIR/weekly" 4
prune "$BACKUP_DIR/monthly" 6
echo "OK $file ($tables tablas, $(du -h "$file" | cut -f1))"
