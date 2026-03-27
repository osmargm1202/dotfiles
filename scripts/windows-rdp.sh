#!/usr/bin/env bash

# ============================================================
# Windows RDP - Container Manager
# ============================================================

CONTAINER="windows"
DISTROBOX="arch-gpu"
RDP_HOST="localhost"
RDP_PORT="3389"
RDP_USER="osmarg"
RDP_PASS="hacker12"
WIDTH="2530"
HEIGHT="1301"

SCRIPT_NAME="windows-rdp"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons"
ICON_URL="https://icones.pro/wp-content/uploads/2021/06/icone-windows-bleu.png"
ICON_FILE="$ICON_DIR/windows.png"

# Seconds to wait after port is open for RDP to fully initialize
RDP_BOOT_DELAY=10
# Max retries for RDP connection
RDP_MAX_RETRIES=5

# ============================================================
# Functions
# ============================================================

container_cmd() {
  if command -v docker &>/dev/null; then
    docker "$@" 2>/dev/null
  elif command -v podman &>/dev/null; then
    podman "$@" 2>/dev/null
  else
    echo "Error: Neither docker nor podman found."
    exit 1
  fi
}

is_installed() {
  [[ -x "$BIN_DIR/$SCRIPT_NAME" ]] && [[ -f "$APPS_DIR/$SCRIPT_NAME.desktop" ]]
}

wait_rdp() {
  echo "Waiting for RDP on $RDP_HOST:$RDP_PORT..."
  for i in $(seq 1 60); do
    if nc -z "$RDP_HOST" "$RDP_PORT" 2>/dev/null; then
      echo "Port open. Waiting ${RDP_BOOT_DELAY}s for Windows to finish booting..."
      sleep "$RDP_BOOT_DELAY"
      echo "RDP is ready."
      return 0
    fi
    sleep 2
  done
  echo "Error: RDP did not become available after 120s."
  return 1
}

rdp_connect() {
  local attempt=1
  while [[ $attempt -le $RDP_MAX_RETRIES ]]; do
    echo "RDP connection attempt $attempt/$RDP_MAX_RETRIES..."
    distrobox-enter "$DISTROBOX" -- \
      xfreerdp3 /v:"$RDP_HOST":"$RDP_PORT" \
      /u:"$RDP_USER" \
      /p:"$RDP_PASS" \
      /size:"${WIDTH}x${HEIGHT}" \
      /dynamic-resolution \
      /sec:nla:off \
      /tls:seclevel:0 \
      /network:lan \
      /bpp:32 \
      /audio-mode:0 \
      +clipboard \
      +home-drive \
      /cert:ignore \
      /wm-class:windows-rdp
    local rc=$?

    # rc=0 means clean disconnect (user closed session)
    if [[ $rc -eq 0 ]]; then
      return 0
    fi

    # If connection was rejected, retry after a delay
    if [[ $attempt -lt $RDP_MAX_RETRIES ]]; then
      echo "Connection failed (exit code $rc). Retrying in 5s..."
      sleep 5
    fi
    ((attempt++))
  done

  echo "Error: Could not connect after $RDP_MAX_RETRIES attempts."
  return 1
}

# ============================================================
# Commands
# ============================================================

do_start() {
  echo "Starting container '$CONTAINER'..."
  container_cmd start "$CONTAINER"
  echo "Container started."
}

do_stop() {
  echo "Stopping container '$CONTAINER'..."
  container_cmd stop "$CONTAINER"
  echo "Container stopped."
}

do_connect() {
  echo "Connecting to existing container '$CONTAINER'..."
  if ! nc -z "$RDP_HOST" "$RDP_PORT" 2>/dev/null; then
    echo "Error: RDP is not available. Is the container running?"
    exit 1
  fi
  rdp_connect
}

do_run() {
  do_start
  wait_rdp || exit 1
  rdp_connect
  echo "RDP session closed."
  do_stop
}

do_install() {
  echo "Installing $SCRIPT_NAME..."

  # Copy script to bin
  mkdir -p "$BIN_DIR"
  cp "$(realpath "$0")" "$BIN_DIR/$SCRIPT_NAME"
  chmod +x "$BIN_DIR/$SCRIPT_NAME"
  echo "  Script  -> $BIN_DIR/$SCRIPT_NAME"

  # Download icon
  mkdir -p "$ICON_DIR"
  if command -v curl &>/dev/null; then
    curl -sL "$ICON_URL" -o "$ICON_FILE"
  elif command -v wget &>/dev/null; then
    wget -q "$ICON_URL" -O "$ICON_FILE"
  else
    echo "  Warning: curl/wget not found, skipping icon download."
  fi
  echo "  Icon    -> $ICON_FILE"

  # Create .desktop
  mkdir -p "$APPS_DIR"
  cat >"$APPS_DIR/$SCRIPT_NAME.desktop" <<EOF
[Desktop Entry]
Name=Windows VM
Comment=Launch Windows container via RDP
Exec=$BIN_DIR/$SCRIPT_NAME run
Icon=$ICON_FILE
Terminal=false
Type=Application
Categories=System;RemoteAccess;
Keywords=windows;rdp;vm;container;
StartupWMClass=windows-rdp
EOF
  chmod +x "$APPS_DIR/$SCRIPT_NAME.desktop"
  echo "  Desktop -> $APPS_DIR/$SCRIPT_NAME.desktop"

  echo "Install complete. '$SCRIPT_NAME' is now available."
}

# ============================================================
# Usage
# ============================================================

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME <command>

Commands:
  (none)     Install if first run, otherwise run
  run        Start container, open RDP, stop container on exit
  start      Start the Windows container only
  stop       Stop the Windows container only
  connect    Connect RDP to an already running container
  install    Install script, icon and .desktop launcher

EOF
}

# ============================================================
# Main
# ============================================================

case "${1:-}" in
run) do_run ;;
start) do_start ;;
stop) do_stop ;;
connect) do_connect ;;
install) do_install ;;
-h | --help) usage ;;
"")
  if is_installed; then
    do_run
  else
    do_install
  fi
  ;;
*)
  echo "Unknown command: $1"
  usage
  exit 1
  ;;
esac
