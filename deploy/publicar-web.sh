#!/usr/bin/env bash
# Publica la web de ION GROUP SIN BORRAR lo que ya existe en el servidor.
# 1) Respalda la carpeta web actual completa (tar.gz con fecha).
# 2) Copia solo archivos nuevos o actualizados de web/ (rsync sin --delete).
#    Los archivos que existen en el servidor y no están en el repo (css/, js/, img/, sistemas de clientes)
#    no se tocan.
# Uso desde tu Mac o el servidor:
#   deploy/publicar-web.sh usuario@62.238.117.110 /ruta/actual/de/la/web
#   deploy/publicar-web.sh --local /ruta/actual/de/la/web      (si ya estás en el servidor)
# Opcional: SIMULAR=1 muestra qué se copiaría sin cambiar nada.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--local" ]; then target=""; webroot="${2:?Indica la carpeta actual de la web}"
else target="${1:?Indica usuario@servidor}"; webroot="${2:?Indica la carpeta actual de la web en el servidor}"; fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
# shellcheck disable=SC2029  # la ruta se expande a propósito en el cliente
run() { if [ -z "$target" ]; then bash -c "$1"; else ssh "$target" "$1"; fi; }

# Lista cerrada: solo se publica lo que es de ION GROUP. Nada de datos internos ni del panel.
files=(index.html 404.html robots.txt sitemap.xml ion-logo-transparent.png css/paginas.css
       sistemas-para-restaurantes.html sistemas-para-barberias.html sistemas-de-reservas.html)
for f in "${files[@]}"; do [ -f "web/$f" ] || { echo "Falta web/$f" >&2; exit 1; }; done

echo "→ Respaldo de la web actual"
run "test -d '$webroot' && tar -czf '$webroot/../web-respaldo-$stamp.tar.gz' -C '$webroot' . && echo 'Respaldo: $webroot/../web-respaldo-$stamp.tar.gz'"

opts=(-a --itemize-changes --relative)   # sin --delete: nunca elimina archivos existentes
[ "${SIMULAR:-}" = 1 ] && opts+=(--dry-run) && echo "(simulación: no se cambia nada)"
dest="$webroot/"; [ -n "$target" ] && dest="$target:$webroot/"
echo "→ Copiando archivos nuevos o actualizados"
(cd web && rsync "${opts[@]}" "${files[@]}" "$dest")
echo "✓ Listo. Para revertir: tar -xzf web-respaldo-$stamp.tar.gz -C '$webroot'"
