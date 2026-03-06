#!/usr/bin/env bash
# Launcher para OpenCode.
# Uso: ./opencode-launcher.sh [--run|--link]

set -e

DISTROBOX_CONTAINER="arch"
OPENCODE_CMD="opencode serve --port 39839"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICON_DIR="${HOME}/.local/share/icons"
ICON_PATH="${ICON_DIR}/opencode.svg"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_PATH="${DESKTOP_DIR}/opencode.desktop"
OPENCODE_LOG="${XDG_RUNTIME_DIR:-/tmp}/opencode-launcher.log"
OPENCODE_URL_DEFAULT="http://127.0.0.1:39839/"

OPENCODE_SVG='<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_1311_94973)"><path d="M24 32H8V16H24V32Z" fill="#4B4646"/><path d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill="#F1ECEC"/></g><defs><clipPath id="clip0_1311_94973"><rect width="32" height="40" fill="white"/></clipPath></defs></svg>'

run_opencode_serve() {
  distrobox-enter "${DISTROBOX_CONTAINER}" -- ${OPENCODE_CMD}
}

run_browser() {
  local url="${1:-${OPENCODE_URL_DEFAULT}}"

  if command -v flatpak >/dev/null 2>&1 && flatpak info org.chromium.Chromium >/dev/null 2>&1; then
    flatpak run org.chromium.Chromium --app="${url}" --new-window --class="OpenCode"
    return 0
  fi

  if command -v chromium >/dev/null 2>&1; then
    chromium --app="${url}" --new-window --class="OpenCode"
    return 0
  fi

  echo "No se encontro Flatpak Chromium ni chromium en el sistema."
  return 1
}

create_desktop_shortcut() {
  mkdir -p "${ICON_DIR}"
  mkdir -p "${DESKTOP_DIR}"

  echo "${OPENCODE_SVG}" >"${ICON_PATH}"
  echo "Icono creado: ${ICON_PATH}"

  cat >"${DESKTOP_PATH}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=OpenCode
Comment=OpenCode Web Application
Exec=${SCRIPT_DIR}/opencode-launcher.sh --run
Icon=${ICON_PATH}
Categories=Development;
NoDisplay=false
StartupWMClass=OpenCode
StartupNotify=true
Terminal=false
EOF

  echo "Acceso directo creado: ${DESKTOP_PATH}"
  echo ""
  echo "OpenCode debería aparecer ahora en el menú de aplicaciones."
  echo "Si no lo ves, ejecuta: update-desktop-database ~/.local/share/applications/"
}

case "${1:-}" in
--run)
  run_browser
  ;;
--link)
  create_desktop_shortcut
  ;;
-h | --help)
  echo "Uso: $(basename "$0") [--run|--link]"
  echo ""
  echo "  (sin argumentos)  Inicia solo OpenCode (opencode serve) en distrobox"
  echo "  --run            Abre Chromium en modo app (Flatpak si existe; fallback a chromium)"
  echo "  --link           Crea un .desktop para acceso directo en el menú de aplicaciones"
  echo "  -h, --help       Muestra esta ayuda"
  ;;
*)
  run_opencode_serve
  ;;
esac
