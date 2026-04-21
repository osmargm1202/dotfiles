#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DOTFILES_ROOT=$(cd -- "$REPO_ROOT/.." && pwd)
ARCHIVE_DIR="${RETIRO_DEST:-$DOTFILES_ROOT/config2}"
TARGET_HOME="${RESTOW_TARGET:-$HOME}"
PKG="${1:-}"

print_help() {
  cat <<EOF
retirar-paquete.sh - unstow y mover un paquete fuera de config/

Uso:
  ./retirar-paquete.sh <paquete>
  ./retirar-paquete.sh --help

Comportamiento:
  1) corre: stow -D -t "$TARGET_HOME" <paquete>
  2) mueve el paquete desde config/<paquete> a config2/<paquete>
  3) evita sobrescribir si ya existe en config2/

Env:
  RESTOW_TARGET  target home para stow (default: $HOME)
  RETIRO_DEST    carpeta destino para archivar (default: ../config2)
EOF
}

if [[ "$PKG" == "-h" || "$PKG" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ -z "$PKG" ]]; then
  echo "Falta el nombre del paquete." >&2
  print_help >&2
  exit 1
fi

if ! command -v stow >/dev/null 2>&1; then
  echo "Missing dependency: stow" >&2
  exit 1
fi

cd "$REPO_ROOT"

if [[ ! -d "$PKG" ]]; then
  echo "No existe el paquete en config/: $PKG" >&2
  exit 1
fi

mkdir -p "$ARCHIVE_DIR"

if [[ -e "$ARCHIVE_DIR/$PKG" ]]; then
  echo "Ya existe en destino: $ARCHIVE_DIR/$PKG" >&2
  exit 1
fi

echo "[1/2] Unstow: $PKG desde $TARGET_HOME"
stow -D -t "$TARGET_HOME" "$PKG"

echo "[2/2] Moviendo: $REPO_ROOT/$PKG -> $ARCHIVE_DIR/$PKG"
mv "$REPO_ROOT/$PKG" "$ARCHIVE_DIR/$PKG"

echo "Listo: $PKG retirado a $ARCHIVE_DIR/$PKG"
