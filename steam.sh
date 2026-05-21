#!/usr/bin/env bash
set -Eeuo pipefail

# Copy a Steam Flatpak library into a native Steam library.
# Override paths when another distro uses different locations:
#   SRC=/path/to/flatpak/steamapps DST=/path/to/native/steamapps ./steam.sh
# Preview without writes:
#   ./steam.sh --dry-run

SRC="${SRC:-$HOME/.var/app/com.valvesoftware.Steam/data/Steam/steamapps}"
DST="${DST:-$HOME/.local/share/Steam/steamapps}"
DRY_RUN=0

say() { printf '\n==> %s\n' "$*"; }
warn() { printf '\nWARNING: %s\n' "$*" >&2; }
fail() {
	printf '\nERROR: %s\n' "$*" >&2
	exit 1
}

usage() {
	cat <<EOF
Usage: $(basename "$0") [--dry-run]

Copies Steam Flatpak steamapps into native Steam steamapps.

Environment overrides:
  SRC=/path/to/flatpak/steamapps
  DST=/path/to/native/steamapps

Defaults:
  SRC=$SRC
  DST=$DST
EOF
}

while (($#)); do
	case "$1" in
	--dry-run | -n)
		DRY_RUN=1
		;;
	--help | -h)
		usage
		exit 0
		;;
	*)
		usage >&2
		fail "Argumento desconocido: $1"
		;;
	esac
	shift
done

command -v rsync >/dev/null 2>&1 || fail "rsync no esta instalado. Instala rsync primero."
[ -d "$SRC" ] || fail "No existe Steam Flatpak steamapps: $SRC"
[ -d "$SRC/common" ] || fail "No existe carpeta common en source: $SRC/common"

if pgrep -x steam >/dev/null 2>&1 || pgrep -f 'com.valvesoftware.Steam|steamwebhelper' >/dev/null 2>&1; then
	fail "Steam parece estar abierto. Cerralo completo antes de correr este script."
fi

say "Origen Flatpak"
printf '%s\n' "$SRC"

say "Destino Steam native/NixOS"
printf '%s\n' "$DST"

say "Resumen antes de copiar"
printf 'Flatpak manifests: '
find "$SRC" -maxdepth 1 -name 'appmanifest_*.acf' 2>/dev/null | wc -l
printf 'Flatpak common dirs: '
find "$SRC/common" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l
printf 'Destino manifests actuales: '
find "$DST" -maxdepth 1 -name 'appmanifest_*.acf' 2>/dev/null | wc -l
printf 'Destino common dirs actuales: '
find "$DST/common" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l

say "Conflictos que se van a respaldar si se pisan archivos"
conflicts=0
while IFS= read -r -d '' src_dir; do
	name=$(basename "$src_dir")
	if [ -e "$DST/common/$name" ]; then
		printf 'common/%s\n' "$name"
		conflicts=$((conflicts + 1))
	fi
done < <(find "$SRC/common" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)

shopt -s nullglob
manifests=("$SRC"/appmanifest_*.acf)
for manifest in "${manifests[@]}"; do
	name=$(basename "$manifest")
	if [ -e "$DST/$name" ]; then
		printf '%s\n' "$name"
		conflicts=$((conflicts + 1))
	fi
done
((conflicts == 0)) && printf 'Ninguno\n'

if ((DRY_RUN)); then
	say "Dry-run rsync preview"
	rsync -aHn --itemize-changes "$SRC/common/" "$DST/common/"
	((${#manifests[@]})) && rsync -aHn --itemize-changes "${manifests[@]}" "$DST/"
	for d in downloading depotcache shadercache workshop compatdata; do
		[ -e "$SRC/$d" ] && rsync -aHn --itemize-changes "$SRC/$d/" "$DST/$d/"
	done
	exit 0
fi

printf '\nEsto copia/mergea hacia Steam native. Si pisa archivos existentes, los guarda en backup dentro de steamapps.\n'
printf 'No desinstala ni borra Flatpak; eso queda manual despues de verificar Steam native.\n'
read -r -p "Continuar? [y/N] " ans
case "$ans" in
y | Y | yes | YES | s | S | si | SI) ;;
*) fail "Cancelado." ;;
esac

stamp=$(date +%Y%m%d-%H%M%S)
backup_dir="$DST/.flatpak-migrate-backup-$stamp"
rsync_flags=(-aH --info=progress2 --backup --backup-dir="$backup_dir")

mkdir -p "$DST/common"

say "Copiando common/"
rsync "${rsync_flags[@]}" "$SRC/common/" "$DST/common/"

say "Copiando appmanifest_*.acf"
if ((${#manifests[@]})); then
	rsync "${rsync_flags[@]}" "${manifests[@]}" "$DST/"
else
	warn "No encontre appmanifest_*.acf en $SRC"
fi

say "Copiando carpetas auxiliares si existen"
for d in downloading depotcache shadercache workshop compatdata; do
	if [ -e "$SRC/$d" ]; then
		mkdir -p "$DST/$d"
		rsync "${rsync_flags[@]}" "$SRC/$d/" "$DST/$d/"
	fi
done

say "Migracion copiada"
printf 'Backup de archivos reemplazados, si hubo: %s\n' "$backup_dir"
printf 'Abri Steam native/NixOS y verifica que juegos aparezcan instalados.\n'
printf 'Si todo esta bien, desinstala Flatpak manualmente con:\n'
printf '  flatpak uninstall --delete-data com.valvesoftware.Steam\n'
