#!/usr/bin/env bash
# Despliegue con releases versionados, health check y rollback automático.
# Uso (en el servidor): deploy/deploy.sh <production|staging> <ref-git>
# Estructura: /srv/ion/<entorno>/releases/<fecha>-<commit>, /srv/ion/<entorno>/current -> release activo.
# Variables opcionales (para pruebas): ION_ROOT, ION_REPO, ION_PORT, ION_RESTART.
set -euo pipefail
env_name="${1:?Entorno: production o staging}"
ref="${2:?Ref git a desplegar (commit o tag)}"
case "$env_name" in production|staging) ;; *) echo "Entorno inválido: $env_name" >&2; exit 1;; esac
root="${ION_ROOT:-/srv/ion}/$env_name"
repo="${ION_REPO:-https://github.com/benjaminrey180-lgtm/casa.git}"
port="${ION_PORT:-$([ "$env_name" = production ] && echo 4310 || echo 4311)}"
restart="${ION_RESTART:-sudo systemctl restart ion-office@$env_name}"
keep=5

mkdir -p "$root/releases" "$root/backups"
previous="$(readlink -f "$root/current" 2>/dev/null || true)"
release="$root/releases/$(date -u +%Y%m%dT%H%M%SZ)-${ref:0:12}"

echo "→ Preparando $release"
git clone --quiet "$repo" "$release"
git -C "$release" checkout --quiet "$ref"
commit="$(git -C "$release" rev-parse HEAD)"
echo "$commit" > "$release/system/REVISION"
(cd "$release/system" && npm ci --omit=dev --silent)

# Respaldo previo en producción (las migraciones solo agregan, pero se respalda igual).
if [ "$env_name" = production ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "→ Respaldo previo"
  DATABASE_URL="$DATABASE_URL" BACKUP_DIR="$root/backups" "$release/system/scripts/backup.sh"
fi

switch_to() { ln -sfn "$1" "$root/current.tmp" && mv -Tf "$root/current.tmp" "$root/current"; }
# Exige estado ok Y el commit esperado: así no se confunde con un proceso viejo que siga vivo.
healthy() {
  local expected="$1"
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:$port/health" 2>/dev/null | grep -q "\"status\":\"ok\".*\"revision\":\"$expected\""; then return 0; fi
    sleep 1
  done
  return 1
}

echo "→ Activando"
switch_to "$release"
eval "$restart"
if healthy "$commit"; then
  echo "✓ $env_name en $commit (health OK)"
  ls -1d "$root"/releases/* | sort | head -n -"$keep" | xargs -r rm -rf
  exit 0
fi

echo "✗ Health check falló. Volviendo a la versión anterior." >&2
if [ -n "$previous" ]; then
  switch_to "$previous"
  eval "$restart"
  healthy "$(cat "$previous/system/REVISION" 2>/dev/null || echo dev)" && echo "↺ Rollback correcto a $(basename "$previous")" >&2 || echo "!! Rollback sin health OK: revisar ya" >&2
else
  echo "!! No hay versión anterior a la que volver" >&2
fi
exit 1
