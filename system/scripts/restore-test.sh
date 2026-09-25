#!/usr/bin/env bash
# Prueba de restauración: restaura un respaldo en una base TEMPORAL, compara conteos y la borra.
# Nunca toca la base de producción. Uso:
#   ADMIN_URL=postgres://usuario@host/postgres scripts/restore-test.sh backups/daily/ion-XXXX.dump [DATABASE_URL_origen]
set -euo pipefail
dump="${1:?Indica el archivo .dump}"
: "${ADMIN_URL:?Define ADMIN_URL (conexión con permiso para crear bases)}"
if [ -f "$dump.sha256" ]; then (cd "$(dirname "$dump")" && sha256sum --check --quiet "$(basename "$dump").sha256"); fi
# La contraseña no va en la línea de comandos (se vería en ps): se pasa por PGPASSWORD.
split_password() {
  if [[ "$1" =~ ^(postgres(ql)?://[^:/@]+):([^@]*)@(.*)$ ]]; then
    local raw="${BASH_REMATCH[3]}"
    PGPASSWORD="$(printf '%b' "${raw//%/\\x}")"; export PGPASSWORD
    printf '%s@%s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[4]}"
  else printf '%s' "$1"; fi
}
admin_url="$(split_password "$ADMIN_URL")"
tmp="ion_restore_test_$(date +%s)"
base="${admin_url%/*}"
psql "$admin_url" -qc "CREATE DATABASE $tmp"
trap 'psql "$admin_url" -qc "DROP DATABASE IF EXISTS $tmp"' EXIT
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$base/$tmp" "$dump"
echo "Restaurado en $tmp. Conteo por tabla:"
query="SELECT 'events',count(*) FROM events UNION ALL SELECT 'tasks',count(*) FROM tasks UNION ALL SELECT 'sectors',count(*) FROM sectors UNION ALL SELECT 'inbox',count(*) FROM inbox UNION ALL SELECT 'jobs',count(*) FROM jobs UNION ALL SELECT 'users',count(*) FROM users ORDER BY 1"
restored="$(psql "$base/$tmp" -At -c "$query")"
echo "$restored"
if [ -n "${2:-}" ]; then
  source_url="$(split_password "$2")"
  source_counts="$(psql "$source_url" -At -c "$query")"
  if [ "$restored" = "$source_counts" ]; then echo "OK: coincide con la base de origen"; else echo "DIFERENCIA con la base de origen:"; diff <(echo "$source_counts") <(echo "$restored") || true; exit 1; fi
fi
echo "Prueba de restauración correcta. Base temporal eliminada."
