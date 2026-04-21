#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
LOCK_FILE="$REPO_ROOT/.restow.lock"
DEBOUNCE_SECONDS="${RESTOW_DEBOUNCE:-0.35}"
TARGET_HOME="${RESTOW_TARGET:-$HOME}"
EVENTS=(modify create delete move attrib)

event_args=()
for event in "${EVENTS[@]}"; do
  event_args+=("-e" "$event")
done

print_help() {
  cat <<EOF
restow.sh - watch repo and restow changed package

Usage:
  ./restow.sh [--help]

Behavior:
  - watches $REPO_ROOT recursively with inotifywait
  - maps first top-level path segment to Stow package name
  - ignores git/editor/temp noise and opencode entirely
  - debounces bursts of fs events
  - runs: stow -R -t \"$TARGET_HOME\" <pkg>
  - serializes with flock so only one watcher runs at once

Env:
  RESTOW_TARGET    target dir for stow (default: $HOME)
  RESTOW_DEBOUNCE  debounce seconds (default: 0.35)
EOF
}

if [[ "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

if [[ $# -gt 0 ]]; then
  echo "Error: unexpected argument(s): $*" >&2
  echo "Usage: ${0##*/} [--help]" >&2
  exit 1
fi

if ! command -v inotifywait >/dev/null 2>&1; then
  echo "Missing dependency: inotifywait" >&2
  echo "Install package: inotify-tools" >&2
  exit 1
fi

if ! command -v stow >/dev/null 2>&1; then
  echo "Missing dependency: stow" >&2
  exit 1
fi

cd "$REPO_ROOT"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Watcher already running: $LOCK_FILE" >&2
  exit 1
fi

is_ignored_path() {
  local rel="$1"

  [[ -z "$rel" ]] && return 0
  [[ "$rel" == .git/* ]] && return 0
  [[ "$rel" == opencode/* ]] && return 0
  [[ "$rel" == */.git/* ]] && return 0
  [[ "$rel" == */node_modules/* ]] && return 0
  [[ "$rel" == */sessions/* ]] && return 0
  [[ "$rel" == *auth.json ]] && return 0
  [[ "$rel" == *build-progress* ]] && return 0
  [[ "$rel" == *crash* ]] && return 0
  [[ "$rel" == *~ ]] && return 0
  [[ "$rel" == *.swp || "$rel" == *.swo || "$rel" == *.swx ]] && return 0
  [[ "$rel" == *.tmp || "$rel" == *.temp || "$rel" == *.bak ]] && return 0
  [[ "$rel" == *.part || "$rel" == *.kate-swp ]] && return 0
  [[ "$rel" == *4913 ]] && return 0
  [[ "$rel" == *'.#'* ]] && return 0
  [[ "$rel" == */#*# ]] && return 0
  return 1
}

package_from_path() {
  local rel="$1"
  local first

  rel="${rel#./}"
  first="${rel%%/*}"

  [[ -z "$first" ]] && return 1
  [[ "$first" == .* ]] && return 1
  [[ "$first" == opencode ]] && return 1
  [[ ! -d "$first" ]] && return 1

  printf '%s\n' "$first"
}

restow_pkg() {
  local pkg="$1"
  echo "[restow] $pkg -> $TARGET_HOME"
  stow -R -t "$TARGET_HOME" "$pkg"
}

flush_pending() {
  local -a pending=("$@")
  local -a uniq=()
  local pkg
  local seen=""

  [[ ${#pending[@]} -eq 0 ]] && return 0

  mapfile -t uniq < <(printf '%s\n' "${pending[@]}" | awk 'NF && !seen[$0]++')

  for pkg in "${uniq[@]}"; do
    restow_pkg "$pkg"
  done
}

cleanup() {
  if [[ -n "${WATCH_PID:-}" ]]; then
    kill "$WATCH_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "Watching $REPO_ROOT"
echo "Target: $TARGET_HOME"
echo "Debounce: ${DEBOUNCE_SECONDS}s"
echo "Ignored: .git opencode node_modules sessions auth.json temp/editor noise"
echo "Ctrl-C to stop"

coproc WATCHER {
  exec inotifywait -m -q -r \
    "${event_args[@]}" \
    --format '%w%f' \
    "$REPO_ROOT"
}
WATCH_PID=$WATCHER_PID

pending=()
while read -r event <&"${WATCHER[0]}"; do
  rel=${event#"$REPO_ROOT"/}
  if ! is_ignored_path "$rel"; then
    pkg=$(package_from_path "$rel" || true)
    if [[ -n "${pkg:-}" ]]; then
      pending+=("$pkg")
    fi
  fi

  while read -r -t "$DEBOUNCE_SECONDS" extra <&"${WATCHER[0]}"; do
    rel=${extra#"$REPO_ROOT"/}
    if is_ignored_path "$rel"; then
      continue
    fi

    pkg=$(package_from_path "$rel" || true)
    if [[ -n "${pkg:-}" ]]; then
      pending+=("$pkg")
    fi
  done

  if [[ ${#pending[@]} -gt 0 ]]; then
    flush_pending "${pending[@]}"
    pending=()
  fi
done
