#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/config/shared/.local/bin/hypr-rofi-ssh-host"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/home/.ssh" "$TMP/bin" "$TMP/state"
printf 'server-a ssh-ed25519 AAAA\nserver-b ssh-ed25519 BBBB\n' >"$TMP/home/.ssh/known_hosts"

cat >"$TMP/lib.sh" <<'SH'
#!/usr/bin/env bash
hypr_rofi_dmenu() {
  local prompt="$1"
  local choice
  IFS= read -r choice <"$ROFI_RESPONSES"
  tail -n +2 "$ROFI_RESPONSES" >"$ROFI_RESPONSES.tmp"
  mv "$ROFI_RESPONSES.tmp" "$ROFI_RESPONSES"
  printf '%s\n' "$prompt" >>"$ROFI_PROMPTS"
  cat >/dev/null
  printf '%s\n' "$choice"
}
HYPR_ROFI_WIDTH=600px
SH

cat >"$TMP/bin/kitty" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$*" >"$KITTY_ARGS"
SH
chmod +x "$TMP/bin/kitty"

run_menu() {
  HOME="$TMP/home" \
  XDG_STATE_HOME="$TMP/state" \
  PATH="$TMP/bin:$PATH" \
  HYPR_ROFI_LIB="$TMP/lib.sh" \
  ROFI_RESPONSES="$TMP/responses" \
  ROFI_PROMPTS="$TMP/prompts" \
  KITTY_ARGS="$TMP/kitty.args" \
  "$SCRIPT"
}

printf 'server-a\n➕ Agregar usuario\ndeploy\n' >"$TMP/responses"
: >"$TMP/prompts"
run_menu

grep -Fxq 'server-a	deploy' "$TMP/state/hypr-rofi-ssh-host/users.tsv" || {
  echo "FAIL: new user was not saved for selected host" >&2
  cat "$TMP/state/hypr-rofi-ssh-host/users.tsv" >&2 || true
  exit 1
}
grep -Fxq -- '-e ssh deploy@server-a' "$TMP/kitty.args" || {
  echo "FAIL: ssh target should include selected user and host" >&2
  cat "$TMP/kitty.args" >&2
  exit 1
}

printf 'server-a\ndeploy\n' >"$TMP/responses"
: >"$TMP/prompts"
run_menu
grep -Fxq -- '-e ssh deploy@server-a' "$TMP/kitty.args" || {
  echo "FAIL: saved user should be selectable for same host" >&2
  cat "$TMP/kitty.args" >&2
  exit 1
}

if grep -Fxq 'server-b	deploy' "$TMP/state/hypr-rofi-ssh-host/users.tsv"; then
  echo "FAIL: users must be saved per known host" >&2
  cat "$TMP/state/hypr-rofi-ssh-host/users.tsv" >&2
  exit 1
fi

echo "hypr rofi ssh host user menu test passed"
