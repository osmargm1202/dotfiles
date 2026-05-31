#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/config/shared/.local/bin/orgm-theme"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/config/orgm-theme/themes" "$TMP/state" "$TMP/runtime" "$TMP/bin"
cp "$ROOT/config/shared/.config/orgm-theme/themes/orgm-light.env" "$TMP/config/orgm-theme/themes/orgm-light.env"
cp "$ROOT/config/shared/.config/orgm-theme/themes/orgm-dark.env" "$TMP/config/orgm-theme/themes/orgm-dark.env"

for bin in hyprctl kitty swaync-client nautilus systemctl waybar-watch gsettings orgm-wallpaper; do
  cat >"$TMP/bin/$bin" <<'SH'
#!/usr/bin/env bash
exit 0
SH
  chmod +x "$TMP/bin/$bin"
done

HOME="$TMP/home" \
XDG_CONFIG_HOME="$TMP/config" \
XDG_STATE_HOME="$TMP/state" \
XDG_RUNTIME_DIR="$TMP/runtime" \
PATH="$TMP/bin:$PATH" \
"$SCRIPT" apply orgm-light >/tmp/orgm-theme-light-contrast.out

WAYBAR="$TMP/config/waybar-hypr/orgm-current.css"
GTK="$TMP/config/gtk-4.0/gtk.css"

assert_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -Fqx "$expected" "$file"; then
    echo "FAIL: expected line not found in $file:" >&2
    echo "$expected" >&2
    echo "--- file ---" >&2
    cat "$file" >&2
    exit 1
  fi
}

assert_contains "$WAYBAR" '@define-color text     #111827;'
assert_contains "$WAYBAR" '@define-color subtext0 #1f2937;'
assert_contains "$WAYBAR" '@define-color overlay0 #374151;'
assert_contains "$WAYBAR" '@define-color blue      #0057d9;'
assert_contains "$WAYBAR" '@define-color panel_bg rgba(255, 255, 255, 1);'
assert_contains "$WAYBAR" '@define-color panel_border rgba(0, 87, 217, 1);'
if grep -Eq '@define-color [^;]+#[0-9a-fA-F]{8};' "$WAYBAR"; then
  echo "FAIL: Waybar generated colors must avoid 8-digit hex syntax" >&2
  cat "$WAYBAR" >&2
  exit 1
fi
assert_contains "$TMP/config/swaync/orgm-current.css" '@define-color base #ffffffff;'
assert_contains "$TMP/config/swaync/orgm-current.css" '@define-color surface #e5e7ebff;'
assert_contains "$GTK" '@define-color window_fg_color #111827;'
assert_contains "$GTK" '@define-color accent_color #0057d9;'

for style in "$ROOT/config/shared/.config/waybar/style.css" "$ROOT/config/shared/.config/waybar-hypr/style.css"; do
  grep -Eq '^#group-usage, .*\{ color: @text; \}$' "$style" || {
    echo "FAIL: Waybar status modules should use @text, not muted gray: $style" >&2
    exit 1
  }
  grep -Fq '#custom-day_month, #custom-date {' "$style" && grep -A4 -F '#custom-day_month, #custom-date {' "$style" | grep -Fq 'color: @text;' || {
    echo "FAIL: Waybar date should use @text, not muted gray: $style" >&2
    exit 1
  }
  grep -Fq '@panel_bg' "$style" || {
    echo "FAIL: Waybar should use generated @panel_bg instead of hardcoded translucent alpha: $style" >&2
    exit 1
  }
done

echo "orgm-theme light contrast smoke test passed"
