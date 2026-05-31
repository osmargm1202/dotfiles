#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/config/shared/.local/bin/hypr-focus-notification-app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

CALLS="$TMP/calls.log"
mkdir -p "$TMP/bin"

cat >"$TMP/bin/hyprctl" <<'SH'
#!/usr/bin/env bash
if [ "${1:-}" = "-j" ] && [ "${2:-}" = "clients" ]; then
  cat <<'JSON'
[
  {"address":"0xdota","pid":570,"class":"steam_app_570","initialClass":"steam_app_570","title":"Dota 2"},
  {"address":"0/chrome","pid":999,"class":"chromium","initialClass":"chromium","title":"WhatsApp - Chromium"}
]
JSON
  exit 0
fi
printf '%s\n' "$*" >>"$CALLS"
SH
chmod +x "$TMP/bin/hyprctl"

PATH="$TMP/bin:$PATH" CALLS="$CALLS" SWAYNC_APP_NAME="Dota 2" "$SCRIPT"

grep -q 'address:0xdota' "$CALLS" || {
  echo "FAIL: Dota notification did not focus steam_app_570" >&2
  cat "$CALLS" >&2 || true
  exit 1
}

: >"$CALLS"
PATH="$TMP/bin:$PATH" CALLS="$CALLS" SWAYNC_HINT_PI_FOCUS_PID="999" SWAYNC_APP_NAME="Pi" "$SCRIPT"
if grep -q 'address:0/chrome' "$CALLS"; then
  echo "FAIL: legacy Pi focus hint should be ignored" >&2
  cat "$CALLS" >&2
  exit 1
fi

echo "hypr focus notification smoke test passed"
