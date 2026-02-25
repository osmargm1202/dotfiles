#!/usr/bin/env bash
# Launcher para OpenCode: inicia el servidor en distrobox y abre Chromium como app
# Uso: ./opencode-launcher.sh [--link]

set -e

DISTROBOX_CONTAINER="arch"
OPENCODE_CMD="opencode web"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICON_DIR="${HOME}/.local/share/icons"
ICON_PATH="${ICON_DIR}/opencode.svg"
DESKTOP_DIR="${HOME}/.local/share/applications"
DESKTOP_PATH="${DESKTOP_DIR}/opencode.desktop"
OPENCODE_LOG="${XDG_RUNTIME_DIR:-/tmp}/opencode-launcher.log"

OPENCODE_SVG='<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_1311_94973)"><path d="M24 32H8V16H24V32Z" fill="#4B4646"/><path d="M24 8H8V32H24V8ZM32 40H0V0H32V40Z" fill="#F1ECEC"/></g><defs><clipPath id="clip0_1311_94973"><rect width="32" height="40" fill="white"/></clipPath></defs></svg>'

# Extrae la URL (ej. http://127.0.0.1:39839/) de la salida de opencode web
extract_opencode_url() {
    local log="$1"
    local url
    for i in {1..30}; do
        sleep 1
        url=$(grep -oE 'https?://127\.0\.0\.1:[0-9]+/?[^[:space:]]*' "$log" 2>/dev/null | head -1)
        if [[ -n "$url" ]]; then
            # Asegurar que termina en /
            [[ "$url" != */ ]] && url="${url}/"
            echo "$url"
            return 0
        fi
    done
    return 1
}

run_opencode() {
    : > "${OPENCODE_LOG}"
    # Iniciar opencode web en distrobox; la salida se guarda para extraer la URL
    distrobox-enter "${DISTROBOX_CONTAINER}" -- ${OPENCODE_CMD} 2>&1 | tee "${OPENCODE_LOG}" &
    local tee_pid=$!
    OPENCODE_URL=$(extract_opencode_url "${OPENCODE_LOG}") || true
    if [[ -z "${OPENCODE_URL}" ]]; then
        echo "No se detectó la URL de OpenCode en la salida. Abriendo con http://127.0.0.1:39839/"
        OPENCODE_URL="http://127.0.0.1:39839/"
    fi
    # Abrir Chromium como app (igual que el .desktop de Fast)
    flatpak run org.chromium.Chromium --app="${OPENCODE_URL}" --new-window --class="OpenCode"
}

create_desktop_shortcut() {
    mkdir -p "${ICON_DIR}"
    mkdir -p "${DESKTOP_DIR}"

    echo "${OPENCODE_SVG}" > "${ICON_PATH}"
    echo "Icono creado: ${ICON_PATH}"

    cat > "${DESKTOP_PATH}" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=OpenCode
Comment=OpenCode Web Application
Exec=flatpak run org.chromium.Chromium --app="http://127.0.0.1:39839/" --new-window --class="OpenCode"
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
    --link)
        create_desktop_shortcut
        ;;
    -h|--help)
        echo "Uso: $(basename "$0") [--link]"
        echo ""
        echo "  (sin argumentos)  Inicia OpenCode en distrobox y abre Chromium como app"
        echo "  --link           Crea un .desktop para acceso directo en el menú de aplicaciones"
        echo "  -h, --help       Muestra esta ayuda"
        echo ""
        echo "  La URL se detecta de la salida de opencode web (p. ej. http://127.0.0.1:39839/)."
        ;;
    *)
        run_opencode
        ;;
esac
