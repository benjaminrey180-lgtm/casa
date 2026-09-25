#!/usr/bin/env bash
# Prueba de restauración: restaura un respaldo en una base TEMPORAL, compara conteos y la borra.
# Nunca toca la base de producción. Uso:
#   ADMIN_URL=postgres://usuario@host/postgres scripts/restore-test.sh backups/daily/ion-XXXX.dump [DATABASE_URL_origen]
set -euo pipefail
dump="${1:?Indica el archivo .dump}"
: "${ADMIN_URL:?Define ADMIN_URL (conexión con permiso para crear bases)}"
[ -f "$dump.sha256" ] && sha256sum --check --quiet "$dump.sha256"
tmp="ion_restore_test_$(date +%s)"
base="${ADMIN_URL%/*}"
psql "$ADMIN_URL" -qc "CREATE DATABASE $tmp"
trap 'psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $tmp"' EXIT
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$base/$tmp" "$dump"
echo "Restaurado en $tmp. Conteo por tabla:"
query="SELECT 'events',count(*) FROM events UNION ALL SELECT 'tasks',count(*) FROM tasks UNION ALL SELECT 'sectors',count(*) FROM sectors UNION ALL SELECT 'inbox',count(*) FROM inbox UNION ALL SELECT 'jobs',count(*) FROM jobs UNION ALL SELECT 'users',count(*) FROM users ORDER BY 1"
restored="$(psql "$base/$tmp" -At -c "$query")"
echo "$restored"
if [ -n "${2:-}" ]; then
  source_counts="$(psql "$2" -At -c "$query")"
  if [ "$restored" = "$source_counts" ]; then echo "OK: coincide con la base de origen"; else echo "DIFERENCIA con la base de origen:"; diff <(echo "$source_counts") <(echo "$restored") || true; exit 1; fi
fi
echo "Prueba de restauración correcta. Base temporal eliminada."
