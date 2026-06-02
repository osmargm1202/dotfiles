#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/config/shared/.local/bin/orgm-theme"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/config/orgm-theme/themes" "$TMP/state" "$TMP/runtime" "$TMP/bin"
cp "$ROOT/config/shared/.config/orgm-theme/themes/orgm-light.env" "$TMP/config/orgm-theme/themes/orgm-light.env"
cp "$ROOT/config/shared/.config/orgm-theme/themes/orgm-dark.env" "$TMP/config/orgm-theme/themes/orgm-dark.env"

for bin in hyprctl kitty swaync-client nautilus systemctl waybar-watch orgm-wallpaper; do
  cat >"$TMP/bin/$bin" <<'SH'
#!/usr/bin/env bash
exit 0
SH
  chmod +x "$TMP/bin/$bin"
done

cat >"$TMP/bin/gsettings" <<'SH'
#!/usr/bin/env bash
echo "gsettings $*" >>"$GSETTINGS_LOG"
SH
chmod +x "$TMP/bin/gsettings"
: >"$TMP/gsettings.log"

HOME="$TMP/home" \
XDG_CONFIG_HOME="$TMP/config" \
XDG_STATE_HOME="$TMP/state" \
XDG_RUNTIME_DIR="$TMP/runtime" \
PATH="$TMP/bin:$PATH" \
GSETTINGS_LOG="$TMP/gsettings.log" \
"$SCRIPT" apply orgm-light >/tmp/orgm-theme-light-contrast.out

WAYBAR="$TMP/config/waybar-hypr/orgm-current.css"
GTK="$TMP/config/gtk-4.0/gtk.css"
GTK3_SETTINGS="$TMP/config/gtk-3.0/settings.ini"
GTK4_SETTINGS="$TMP/config/gtk-4.0/settings.ini"
QT5="$TMP/config/qt5ct/qt5ct.conf"
QT6="$TMP/config/qt6ct/qt6ct.conf"
KITTY="$TMP/config/kitty/current-theme.conf"

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
assert_contains "$GTK3_SETTINGS" 'gtk-font-name=Inter 11'
assert_contains "$GTK4_SETTINGS" 'gtk-font-name=Inter 11'
assert_contains "$QT5" 'general="Inter,11,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"'
assert_contains "$QT5" 'fixed="JetBrains Mono,11,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"'
assert_contains "$QT6" 'general="Inter,11,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"'
assert_contains "$QT6" 'fixed="JetBrains Mono,11,-1,5,400,0,0,0,0,0,0,0,0,0,0,1"'
assert_contains "$TMP/gsettings.log" 'gsettings set org.gnome.desktop.interface font-name Inter 11'
assert_contains "$TMP/gsettings.log" 'gsettings set org.gnome.desktop.interface document-font-name Inter 11'
assert_contains "$TMP/gsettings.log" 'gsettings set org.gnome.desktop.interface monospace-font-name JetBrains Mono 11'
assert_contains "$KITTY" 'background_opacity 1.0'

HYPR_RULES=$(ROOT="$ROOT" XDG_STATE_HOME="$TMP/state" HOME="$TMP/home" lua - <<'LUA'
hl = {}
function hl.window_rule(rule)
  if rule.match and rule.match.class and rule.opacity then
    print(rule.match.class .. "=" .. rule.opacity)
  end
end
dofile(os.getenv("ROOT") .. "/config/shared/.config/hypr/lua/windows-workspaces.lua")
LUA
)
if ! grep -Fqx '^(kitty)$=1.0 override 1.0 override 1.0 override' <<<"$HYPR_RULES"; then
  echo "FAIL: light mode should make kitty fully opaque at Hyprland level" >&2
  echo "--- hypr rules ---" >&2
  printf '%s\n' "$HYPR_RULES" >&2
  exit 1
fi
if ! grep -Fqx '.*=1.0 override 1.0 override 1.0 override' <<<"$HYPR_RULES"; then
  echo "FAIL: light mode should make global Hyprland opacity fully opaque" >&2
  echo "--- hypr rules ---" >&2
  printf '%s\n' "$HYPR_RULES" >&2
  exit 1
fi

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
