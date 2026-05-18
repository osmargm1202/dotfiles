# Hyprchy v2 Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Hyprchy as a fast Hyprland profile with fuzzel/rofi launchers, a graphical all-in-one system control menu, HyprPanel widgets, wallpaper/theme controls, and Chromium web-app maker/remover.

**Architecture:** Keep the current working Hyprland stack as the base. Remove the Walker/Elephant/TUI experiment from Hyprchy and replace it with small shell scripts: fuzzel for fast app launching and rofi for the all-in-one control center. Use HyprPanel for rich panels such as calendar, media, network, bluetooth, volume, notifications, and status widgets.

**Tech Stack:** NixOS profile, Hyprland Lua, fuzzel, rofi-wayland, HyprPanel, Hyprpaper/Waypaper-compatible wallpaper control, shell scripts, Chromium `.desktop` web apps, dot.sh-managed dotfiles.

---

## Reference Findings

Reference repo: `https://github.com/binoymanoj/dotfiles`

Important patterns:

- `hypr/scripts/main-menu.sh` — rofi all-in-one menu with nested menus for Apps, Tools, Install, Update, Remove.
- `hypr/scripts/rofi-smart-run.sh` — smart rofi command/url/search launcher.
- `hypr/scripts/power-menu.sh` — graphical rofi power menu.
- `hypr/scripts/wallpaper-selector.sh` — rofi wallpaper selector with thumbnails and Hyprpaper reload.
- `hyprpanel/config.json`, `hyprpanel/modules.json`, `hyprpanel/modules.scss` — HyprPanel-based panel/control center/calendar/module setup.
- `rofi/config.rasi`, `rofi/power.rasi` — styled rofi launcher/menu themes.
- `mpv/` — missing app config we should add to this dotfiles repo.

Important direction changes from user:

- Do not continue Walker/Elephant as the base.
- Keep fuzzel speed and use rofi where it makes sense for richer menus.
- `hyprchy.nix` should be “Hyprland, but with control-center/theme/app management,” not a separate launcher stack experiment.
- The previous `hyprchy-tui` is not the desired UX; the desired UX is an interactive graphical system menu.
- Add HyprPanel for panels/widgets such as calendar and some app/system modules.
- Add app maker/remover, especially Chromium web apps.
- Add system-wide dark mode, themes, wallpaper-derived colors, and reload/apply actions.

---

## Target User Experience

```text
Win+Space       -> fast app launcher (fuzzel or rofi drun; default: fuzzel)
Win+R           -> smart run/search/url launcher (rofi)
Win+Alt+Space   -> Hyprchy all-in-one control center (rofi)
Win+Alt+W       -> wallpaper selector (rofi thumbnails)
Win+Alt+T       -> theme selector / dark-light mode menu
Win+Shift+Q     -> graphical power menu
HyprPanel       -> dashboard/control center/calendar/media/network/bluetooth/audio widgets
```

All-in-one menu tree:

```text
Hyprchy Control Center
├── Apps
│   ├── Launch app
│   ├── Smart run/search/url
│   ├── App Maker
│   │   ├── Chromium web app
│   │   ├── Terminal app wrapper
│   │   └── Custom desktop entry
│   ├── App Remover
│   │   ├── Remove Chromium web app
│   │   ├── Remove custom desktop entry
│   │   └── Rebuild desktop database
│   └── Open applications folder
├── System
│   ├── NixOS build Hyprchy
│   ├── NixOS test Hyprchy
│   ├── NixOS switch Hyprchy
│   ├── dot.sh status
│   ├── dot.sh diff
│   ├── dot.sh sync
│   └── Logs
│       ├── Hyprland errors
│       ├── HyprPanel logs
│       ├── Waybar logs (if used)
│       └── Nix build logs
├── Appearance
│   ├── Dark mode
│   ├── Light mode
│   ├── Toggle dark/light
│   ├── Theme selector
│   ├── Wallpaper selector
│   ├── Random wallpaper
│   ├── Generate colors from wallpaper
│   └── Reload themed apps
├── Hardware
│   ├── Network manager
│   ├── Bluetooth manager
│   ├── Audio mixer
│   ├── Display settings
│   └── Power profile / battery status
├── Panels
│   ├── Restart HyprPanel
│   ├── Stop HyprPanel
│   ├── Open HyprPanel config
│   └── Calendar/dashboard
├── Session
│   ├── Lock
│   ├── Logout
│   ├── Reboot
│   └── Power off
└── Help
    ├── Keybindings
    ├── Open Hyprchy config folder
    └── About Hyprchy
```

---

## File Structure

### Remove or stop using from Hyprchy v1

These files are part of the Walker/Elephant/TUI experiment and should be removed from managed paths after plan approval:

- `config/shared/.config/elephant/elephant.toml`
- `config/shared/.config/elephant/menus/hyprchy_system.lua`
- `config/shared/.config/walker/config.toml`
- `config/shared/.config/waybar-hyprchy/config`
- `config/shared/.config/waybar-hyprchy/style.css`
- `config/shared/.local/bin/hypr-dmenu`
- `config/shared/.local/bin/hypr-launcher`
- `config/shared/.local/bin/hyprchy-audio`
- `config/shared/.local/bin/hyprchy-bluetooth`
- `config/shared/.local/bin/hyprchy-network`
- `config/shared/.local/bin/hyprchy-session-start`
- `config/shared/.local/bin/hyprchy-tui`

These files may be removed or rewritten:

- `config/shared/.config/hypr/hyprchy.lua`
- `config/shared/.config/hypr/lua/hyprchy-programs.lua`
- `config/shared/.config/hypr/lua/hyprchy-autostart.lua`
- `config/shared/.config/hypr/lua/hyprchy-keybindings.lua`

These files should be reverted if their only change was supporting Hyprchy v1:

- `config/shared/.config/hypr/scripts/walker-window-switch.sh`
- `config/shared/.local/bin/fuzzel-calc`
- `config/shared/.local/bin/fuzzel-hypr-window`
- `config/shared/.local/bin/fuzzel-open-file`
- `config/shared/.local/bin/fuzzel-open-file-dir`
- `config/shared/.local/bin/fuzzel-open-file-terminal`
- `config/shared/.local/bin/fuzzel-ssh-host`
- `config/shared/.local/bin/fuzzel-tmux-arch`
- `config/shared/.local/bin/waybar-hypr-dock`

### Keep from Hyprchy v1

- `nixos/profiles/hyprchy.nix` — keep, but rewrite to remove Walker/Elephant and add rofi/HyprPanel/theme tooling.
- Host outputs in `flake.nix`:
  - `hyprchy`
  - `orgm-hyprchy`
  - `lenovo-hyprchy`
  - `ero-hyprchy`
- `nixos/hosts/generic/hardware-configuration.nix` — keep if generic eval remains useful.
- OpenSpec artifacts may remain as history, but create a new change for Hyprchy v2.

### Create for Hyprchy v2

- `config/shared/.config/hypr/hyprchy.lua` — Hyprchy entrypoint using current Hyprland baseline plus v2 overlays.
- `config/shared/.config/hypr/lua/hyprchy-programs.lua` — fuzzel/rofi/hyprpanel command map.
- `config/shared/.config/hypr/lua/hyprchy-autostart.lua` — starts HyprPanel, Hyprpaper, SwayNC, clipboard watchers, keyring, applets.
- `config/shared/.config/hypr/lua/hyprchy-keybindings.lua` — current keybindings plus v2 menu bindings.
- `config/shared/.config/rofi-hyprchy/config.rasi` — rofi drun/run/window/filebrowser config.
- `config/shared/.config/rofi-hyprchy/control-center.rasi` — all-in-one menu theme.
- `config/shared/.config/rofi-hyprchy/power.rasi` — power menu theme.
- `config/shared/.config/hyprpanel/config.json` — HyprPanel config adapted from reference and current user style.
- `config/shared/.config/hyprpanel/modules.json` — HyprPanel custom modules.
- `config/shared/.config/hyprpanel/modules.scss` — HyprPanel module colors/style.
- `config/shared/.config/mpv/mpv.conf` — MPV default config.
- `config/shared/.config/mpv/input.conf` — MPV keybindings.
- `config/shared/.local/bin/hyprchy-control-center` — main rofi all-in-one dispatcher.
- `config/shared/.local/bin/hyprchy-smart-run` — rofi smart run/search/url.
- `config/shared/.local/bin/hyprchy-power-menu` — rofi power menu.
- `config/shared/.local/bin/hyprchy-wallpaper-menu` — wallpaper selector.
- `config/shared/.local/bin/hyprchy-theme-menu` — theme/dark-light/color menu.
- `config/shared/.local/bin/hyprchy-theme-apply` — applies selected theme to supported apps.
- `config/shared/.local/bin/hyprchy-app-maker` — creates `.desktop` launchers and Chromium web apps.
- `config/shared/.local/bin/hyprchy-app-remover` — removes user-created launchers/web apps.
- `config/shared/.local/bin/hyprchy-reload-ui` — reloads Hyprland, HyprPanel, rofi cache, GTK settings where safe.
- `config/shared/.local/share/hyprchy/apps/` — metadata store for app maker/remover.
- `config/shared/.local/share/hyprchy/themes/` — theme registry and palette files.

### Modify

- `config/dotfiles.json` — remove Walker/Elephant/waybar-hyprchy paths, add rofi-hyprchy, hyprpanel, mpv, hyprchy data paths.
- `nixos/profiles/hyprchy.nix` — remove Walker/Elephant inputs/services/packages; add rofi-wayland, hyprpanel, mpv, theme/color tools.
- `flake.nix` — remove Walker/Elephant inputs if no other profile uses them.
- `flake.lock` — update after removing inputs.

---

## Task 1: Freeze current state and create Hyprchy v2 OpenSpec change

**Files:**

- Create: `openspec/changes/hyprchy-v2/proposal.md`
- Create: `openspec/changes/hyprchy-v2/design.md`
- Create: `openspec/changes/hyprchy-v2/tasks.md`

- [ ] **Step 1: Record current HEAD**

Run:

```bash
git status --short
git rev-parse --short HEAD
```

Expected:

```text
working tree clean or only intentional plan files
HEAD is current pushed commit
```

- [ ] **Step 2: Create v2 proposal**

Write `openspec/changes/hyprchy-v2/proposal.md`:

```markdown
# Proposal: hyprchy-v2

## Summary

Rebuild Hyprchy as a fast Hyprland profile centered on fuzzel/rofi, HyprPanel, and an all-in-one graphical control center.

## Motivation

Walker/Elephant introduced latency and service complexity. The desired UX is closer to Omarchy/reference dotfiles: quick app launcher, graphical rofi menus, HyprPanel widgets, wallpaper/theme controls, and app maker/remover.

## Non-goals

- Do not use Walker/Elephant as the default launcher stack.
- Do not replace the current working Hyprland profile.
- Do not run heavy builds until user explicitly approves.

## Acceptance Criteria

- `orgm-hyprchy` boots Hyprland with current baseline behavior.
- `Win+Space` opens a fast app launcher.
- `Win+Alt+Space` opens the Hyprchy control center.
- Control center can manage apps, appearance, system commands, hardware menus, panels, session actions, and help.
- Chromium web app maker/remover works through user-owned `.desktop` files.
- HyprPanel starts in Hyprchy and provides dashboard/calendar/media/network/bluetooth/audio widgets.
- MPV config/package is included.
```

- [ ] **Step 3: Commit plan artifacts only if user asks**

Do not commit unless user explicitly asks.

---

## Task 2: Remove Walker/Elephant architecture from Hyprchy

**Files:**

- Modify: `flake.nix`
- Modify: `flake.lock`
- Modify: `nixos/profiles/hyprchy.nix`
- Modify: `config/dotfiles.json`
- Delete: `config/shared/.config/walker/config.toml`
- Delete: `config/shared/.config/elephant/elephant.toml`
- Delete: `config/shared/.config/elephant/menus/hyprchy_system.lua`
- Delete: `config/shared/.config/waybar-hyprchy/config`
- Delete: `config/shared/.config/waybar-hyprchy/style.css`
- Delete: `config/shared/.local/bin/hypr-dmenu`
- Delete: `config/shared/.local/bin/hypr-launcher`
- Delete: `config/shared/.local/bin/hyprchy-audio`
- Delete: `config/shared/.local/bin/hyprchy-bluetooth`
- Delete: `config/shared/.local/bin/hyprchy-network`
- Delete: `config/shared/.local/bin/hyprchy-session-start`
- Delete: `config/shared/.local/bin/hyprchy-tui`

- [ ] **Step 1: Create deletion list**

Run:

```bash
printf '%s\n' \
  config/shared/.config/walker \
  config/shared/.config/elephant \
  config/shared/.config/waybar-hyprchy \
  config/shared/.local/bin/hypr-dmenu \
  config/shared/.local/bin/hypr-launcher \
  config/shared/.local/bin/hyprchy-audio \
  config/shared/.local/bin/hyprchy-bluetooth \
  config/shared/.local/bin/hyprchy-network \
  config/shared/.local/bin/hyprchy-session-start \
  config/shared/.local/bin/hyprchy-tui
```

Expected: paths match only Walker/Elephant/TUI experiment.

- [ ] **Step 2: Remove paths from `config/dotfiles.json`**

Remove:

```json
".config/elephant",
".config/walker",
".config/waybar-hyprchy",
```

Keep:

```json
".config/fuzzel",
".config/rofi",
".config/hypr",
".config/waybar-hypr",
".local/bin",
```

- [ ] **Step 3: Remove Walker/Elephant from `hyprchy.nix`**

Remove from `nixos/profiles/hyprchy.nix`:

```nix
inputs.walker.nixosModules.default
programs.walker
systemd.user.services.hyprchy-elephant
systemd.user.services.hyprchy-walker
walkerPkg
elephantPkg
```

Keep `hyprlandPkgs`, `hyprpaperPkg`, and current Hyprland packages.

- [ ] **Step 4: Remove Walker/Elephant flake inputs if unused**

Remove from `flake.nix` only if no other profile uses them:

```nix
elephant
walker
walker.inputs.elephant.follows
```

Then update lock with user-approved command:

```bash
nix flake lock --update-input walker --update-input elephant
```

If removing inputs entirely, run the correct lock update command after edit:

```bash
nix flake lock
```

Do not run heavy builds in this task.

- [ ] **Step 5: Validation**

Run:

```bash
jq empty config/dotfiles.json
nix eval --raw .#nixosConfigurations.orgm-hyprchy.config.system.name
nix eval --raw .#nixosConfigurations.lenovo-hyprchy.config.system.name
nix eval --raw .#nixosConfigurations.ero-hyprchy.config.system.name
```

Expected:

```text
orgm
lenovo
ero
```

---

## Task 3: Create Hyprchy v2 command map and keybindings

**Files:**

- Rewrite: `config/shared/.config/hypr/lua/hyprchy-programs.lua`
- Rewrite: `config/shared/.config/hypr/lua/hyprchy-keybindings.lua`
- Rewrite: `config/shared/.config/hypr/lua/hyprchy-autostart.lua`
- Keep/modify: `config/shared/.config/hypr/hyprchy.lua`

- [ ] **Step 1: Write `hyprchy-programs.lua`**

```lua
local programs = require("lua.programs")

local hyprchy = {}
for key, value in pairs(programs) do
  hyprchy[key] = value
end

hyprchy.menu = "fuzzel --prompt 'Apps> '"
hyprchy.control_center = "~/.local/bin/hyprchy-control-center"
hyprchy.smart_run = "~/.local/bin/hyprchy-smart-run"
hyprchy.power_menu = "~/.local/bin/hyprchy-power-menu"
hyprchy.wallpaper_menu = "~/.local/bin/hyprchy-wallpaper-menu"
hyprchy.theme_menu = "~/.local/bin/hyprchy-theme-menu"
hyprchy.panel_restart = "sh -lc 'hyprpanel -q; hyprpanel'"
hyprchy.panel_stop = "hyprpanel -q"

return hyprchy
```

- [ ] **Step 2: Update keybindings**

Ensure `hyprchy-keybindings.lua` includes:

```lua
hl.bind(mainMod .. " + Space", hl.dsp.exec_cmd(programs.menu))
hl.bind(mainMod .. " + R", hl.dsp.exec_cmd(programs.smart_run))
hl.bind(mainMod .. " + ALT + Space", hl.dsp.exec_cmd(programs.control_center))
hl.bind(mainMod .. " + ALT + W", hl.dsp.exec_cmd(programs.wallpaper_menu))
hl.bind(mainMod .. " + ALT + T", hl.dsp.exec_cmd(programs.theme_menu))
hl.bind(mainMod .. " + SHIFT + Q", hl.dsp.exec_cmd(programs.power_menu))
hl.bind(mainMod .. " + SHIFT + T", hl.dsp.exec_cmd(programs.panel_restart))
hl.bind(mainMod .. " + T", hl.dsp.exec_cmd(programs.panel_stop))
```

Keep existing workspace/window/media/screenshot bindings from current Hyprland.

- [ ] **Step 3: Update autostart**

`hyprchy-autostart.lua` should start:

```lua
local exec_once = {
  "systemctl --user import-environment WAYLAND_DISPLAY DISPLAY XDG_SESSION_TYPE XDG_SESSION_DESKTOP XDG_CURRENT_DESKTOP QT_QPA_PLATFORM QT_QPA_PLATFORMTHEME QT_QPA_PLATFORMTHEME_QT6 ELECTRON_OZONE_PLATFORM_HINT MOZ_ENABLE_WAYLAND NIXOS_OZONE_WL TERMINAL XCURSOR_THEME XCURSOR_SIZE",
  "dbus-update-activation-environment --systemd WAYLAND_DISPLAY DISPLAY XDG_SESSION_TYPE XDG_SESSION_DESKTOP XDG_CURRENT_DESKTOP QT_QPA_PLATFORM QT_QPA_PLATFORMTHEME QT_QPA_PLATFORMTHEME_QT6 ELECTRON_OZONE_PLATFORM_HINT MOZ_ENABLE_WAYLAND NIXOS_OZONE_WL TERMINAL XCURSOR_THEME XCURSOR_SIZE",
  "hyprpanel",
  "hyprpaper",
  "swaync",
  "nm-applet --indicator",
  "blueman-applet",
  "gnome-keyring-daemon --start --components=secrets,pkcs11,ssh",
  "hyprpolkitagent",
  "wl-paste --type text --watch cliphist store",
  "wl-paste --type image --watch cliphist store",
  "hypridle",
}

hl.on("hyprland.start", function()
  for _, cmd in ipairs(exec_once) do
    hl.exec_cmd(cmd)
  end
end)
```

- [ ] **Step 4: Validate Lua**

Run:

```bash
luac -p config/shared/.config/hypr/hyprchy.lua \
  config/shared/.config/hypr/lua/hyprchy-programs.lua \
  config/shared/.config/hypr/lua/hyprchy-keybindings.lua \
  config/shared/.config/hypr/lua/hyprchy-autostart.lua
```

Expected: no output, exit 0.

---

## Task 4: Build rofi all-in-one control center

**Files:**

- Create: `config/shared/.local/bin/hyprchy-control-center`
- Create: `config/shared/.config/rofi-hyprchy/control-center.rasi`
- Modify: `config/dotfiles.json`

- [ ] **Step 1: Add rofi-hyprchy path to dotfiles**

Add to `config/dotfiles.json` shared paths:

```json
".config/rofi-hyprchy",
```

- [ ] **Step 2: Create first control center script**

Write `config/shared/.local/bin/hyprchy-control-center`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROFI_THEME="${HYPRCHY_ROFI_THEME:-$HOME/.config/rofi-hyprchy/control-center.rasi}"

choose() {
  rofi -dmenu -i -show-icons -p "$1" -theme "$ROFI_THEME"
}

main_menu() {
  printf '%s\n' \
    '󰀻 Apps' \
    '󰒓 System' \
    '󰸉 Appearance' \
    '󰚥 Hardware' \
    '󱂬 Panels' \
    '󰐥 Session' \
    '󰋖 Help' \
    '󰅖 Quit' | choose 'Hyprchy'
}

while true; do
  choice="$(main_menu || true)"
  case "$choice" in
    *'Apps') exec hyprchy-app-menu ;;
    *'System') exec hyprchy-system-menu ;;
    *'Appearance') exec hyprchy-theme-menu ;;
    *'Hardware') exec hyprchy-hardware-menu ;;
    *'Panels') exec hyprchy-panel-menu ;;
    *'Session') exec hyprchy-power-menu ;;
    *'Help') exec hyprchy-help-menu ;;
    *'Quit'|'') exit 0 ;;
  esac
done
```

- [ ] **Step 3: Create focused menu scripts**

Create these scripts as separate files so each menu stays small:

```text
config/shared/.local/bin/hyprchy-app-menu
config/shared/.local/bin/hyprchy-system-menu
config/shared/.local/bin/hyprchy-hardware-menu
config/shared/.local/bin/hyprchy-panel-menu
config/shared/.local/bin/hyprchy-help-menu
```

Each script uses the same `choose()` pattern and calls a single action per selected row.

- [ ] **Step 4: Validate scripts**

Run:

```bash
bash -n config/shared/.local/bin/hyprchy-control-center
```

Expected: exit 0.

---

## Task 5: Implement smart run/search/url launcher

**Files:**

- Create: `config/shared/.local/bin/hyprchy-smart-run`

- [ ] **Step 1: Create script**

Implement reference-inspired behavior:

```bash
#!/usr/bin/env bash
set -euo pipefail

browser="${BROWSER:-chromium}"
input="${*:-}"

if [ -z "$input" ]; then
  input="$(printf '%s\n' '!g Google' '!d DuckDuckGo' '!y YouTube' | rofi -dmenu -i -p 'Run/Search')"
fi

input="$(printf '%s' "$input" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
[ -z "$input" ] && exit 0

open_url() {
  nohup "$browser" "$1" >/dev/null 2>&1 &
}

case "$input" in
  http://*|https://*) open_url "$input" ;;
  localhost:*|127.0.0.1:*) open_url "http://$input" ;;
  *'!g'*) q="${input//!g/}"; open_url "https://www.google.com/search?q=${q// /+}" ;;
  *'!y'*) q="${input//!y/}"; open_url "https://www.youtube.com/results?search_query=${q// /+}" ;;
  *'!d'*) q="${input//!d/}"; open_url "https://duckduckgo.com/?q=${q// /+}" ;;
  *)
    if command -v "$input" >/dev/null 2>&1; then
      nohup "$input" >/dev/null 2>&1 &
    else
      open_url "https://duckduckgo.com/?q=${input// /+}"
    fi
    ;;
esac
```

- [ ] **Step 2: Validate**

Run:

```bash
bash -n config/shared/.local/bin/hyprchy-smart-run
```

Expected: exit 0.

---

## Task 6: Implement Chromium web app maker/remover

**Files:**

- Create: `config/shared/.local/bin/hyprchy-app-maker`
- Create: `config/shared/.local/bin/hyprchy-app-remover`
- Create directory: `config/shared/.local/share/hyprchy/apps/`

- [ ] **Step 1: Decide generated app location**

Default generated app files should be user-local runtime files, not tracked source files:

```text
~/.local/share/applications/hyprchy-<slug>.desktop
~/.local/share/hyprchy/apps/<slug>.json
```

- [ ] **Step 2: Create Chromium app maker**

Script behavior:

```text
Prompt: App name
Prompt: URL
Prompt: Icon path or blank
Write .desktop with chromium --app=<URL>
Write metadata json
Run update-desktop-database if available
Notify success
```

Desktop template:

```ini
[Desktop Entry]
Version=1.0
Type=Application
Name=APP_NAME
Comment=Hyprchy Chromium web app
Exec=chromium --new-window --app=APP_URL
Icon=APP_ICON
Terminal=false
Categories=Network;WebBrowser;
StartupNotify=true
StartupWMClass=APP_SLUG
```

- [ ] **Step 3: Create remover**

Script behavior:

```text
List ~/.local/share/hyprchy/apps/*.json via rofi
Remove selected .desktop
Remove metadata json
Run update-desktop-database if available
Notify success
```

- [ ] **Step 4: Validate syntax**

Run:

```bash
bash -n config/shared/.local/bin/hyprchy-app-maker
bash -n config/shared/.local/bin/hyprchy-app-remover
```

Expected: exit 0.

---

## Task 7: Add appearance/theme manager

**Files:**

- Create: `config/shared/.local/bin/hyprchy-theme-menu`
- Create: `config/shared/.local/bin/hyprchy-theme-apply`
- Create: `config/shared/.local/bin/hyprchy-wallpaper-menu`
- Create: `config/shared/.local/share/hyprchy/themes/catppuccin-macchiato.json`
- Create: `config/shared/.local/share/hyprchy/themes/catppuccin-latte.json`

- [ ] **Step 1: Theme data format**

Example theme file:

```json
{
  "name": "catppuccin-macchiato",
  "mode": "dark",
  "gtk_theme": "catppuccin-macchiato-teal-standard",
  "cursor_theme": "Catppuccin-Macchiato-Teal-Cursors",
  "accent": "#8bd5ca",
  "background": "#24273a",
  "foreground": "#cad3f5"
}
```

- [ ] **Step 2: Apply dark/light mode**

`hyprchy-theme-apply dark` should run:

```bash
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
gsettings set org.gnome.desktop.interface gtk-theme 'catppuccin-macchiato-teal-standard'
gsettings set org.gnome.desktop.interface icon-theme 'Papirus-Dark'
```

`hyprchy-theme-apply light` should run:

```bash
gsettings set org.gnome.desktop.interface color-scheme 'prefer-light'
gsettings set org.gnome.desktop.interface gtk-theme 'catppuccin-latte-teal-standard'
gsettings set org.gnome.desktop.interface icon-theme 'Papirus'
```

- [ ] **Step 3: Wallpaper selector**

Use rofi to select image from:

```text
~/.config/wallpapers
~/Pictures/Wallpapers
```

Set via existing `hypr-random-wallpaper` if compatible, otherwise `hyprctl hyprpaper wallpaper`.

- [ ] **Step 4: Color-from-wallpaper phase**

Initial plan should expose menu item but can be gated until tool chosen:

```text
Generate colors from wallpaper
```

Candidate tools to evaluate before implementation:

```text
matugen
wallust
pywal16
```

Do not add a generator until one is selected and tested.

---

## Task 8: Add HyprPanel

**Files:**

- Create: `config/shared/.config/hyprpanel/config.json`
- Create: `config/shared/.config/hyprpanel/modules.json`
- Create: `config/shared/.config/hyprpanel/modules.scss`
- Modify: `config/dotfiles.json`
- Modify: `nixos/profiles/hyprchy.nix`

- [ ] **Step 1: Add dotfile path**

Add:

```json
".config/hyprpanel",
```

- [ ] **Step 2: Add packages to `hyprchy.nix`**

Add package if available:

```nix
hyprpanel
```

If package attr is unavailable, add a clear note and defer to package strategy.

- [ ] **Step 3: Start HyprPanel in `hyprchy-autostart.lua`**

Ensure autostart includes:

```lua
"hyprpanel",
```

- [ ] **Step 4: Minimal config acceptance**

HyprPanel should provide:

```text
dashboard
workspaces
media
network
bluetooth
volume
clock/calendar
notifications
battery if present
```

- [ ] **Step 5: Validate config**

Run:

```bash
jq empty config/shared/.config/hyprpanel/config.json
jq empty config/shared/.config/hyprpanel/modules.json
```

Expected: exit 0.

---

## Task 9: Add MPV config and packages

**Files:**

- Create: `config/shared/.config/mpv/mpv.conf`
- Create: `config/shared/.config/mpv/input.conf`
- Modify: `config/dotfiles.json`
- Modify: `nixos/profiles/hyprchy.nix`

- [ ] **Step 1: Add dotfile path**

Add:

```json
".config/mpv",
```

- [ ] **Step 2: Create `mpv.conf`**

```conf
profile=gpu-hq
gpu-api=vulkan
vo=gpu-next
hwdec=auto-safe
save-position-on-quit=yes
keep-open=yes
osc=yes
osd-bar=yes
sub-auto=fuzzy
slang=spa,es,en
alang=spa,es,en
screenshot-directory=~/Pictures/Screenshots
```

- [ ] **Step 3: Create `input.conf`**

```conf
SPACE cycle pause
q quit
Q quit-watch-later
f cycle fullscreen
m cycle mute
UP add volume 5
DOWN add volume -5
LEFT seek -5
RIGHT seek 5
Shift+LEFT seek -30
Shift+RIGHT seek 30
s screenshot
```

- [ ] **Step 4: Ensure package exists**

`hyprchy.nix` already includes `mpv` from the previous profile. Keep it.

---

## Task 10: Validate and stage final Hyprchy v2

**Files:**

- All touched files.

- [ ] **Step 1: Lightweight validation**

Run:

```bash
jq empty config/dotfiles.json
bash -n config/shared/.local/bin/hyprchy-*
luac -p config/shared/.config/hypr/hyprchy.lua \
  config/shared/.config/hypr/lua/hyprchy-programs.lua \
  config/shared/.config/hypr/lua/hyprchy-keybindings.lua \
  config/shared/.config/hypr/lua/hyprchy-autostart.lua
nix eval --raw .#nixosConfigurations.orgm-hyprchy.config.system.name
```

Expected:

```text
orgm
```

- [ ] **Step 2: Review workload check**

Run:

```bash
git diff --stat
git diff --name-only
```

If diff exceeds 400 changed lines, split commits:

```text
1. Remove Walker/Elephant Hyprchy v1
2. Add rofi/fuzzel control center scripts
3. Add theme/wallpaper/app maker
4. Add HyprPanel/mpv
5. Update Nix profile
```

- [ ] **Step 3: Commit only after user approval**

Suggested commit sequence:

```bash
git add <slice-files>
git commit -m "refactor: reset hyprchy launcher stack"

git add <slice-files>
git commit -m "feat: add hyprchy control center"

git add <slice-files>
git commit -m "feat: add hyprchy theme tools"

git add <slice-files>
git commit -m "feat: add hyprpanel to hyprchy"
```

- [ ] **Step 4: Heavy validation only after user approval**

Commands:

```bash
nix flake check
nix build .#nixosConfigurations.orgm-hyprchy.config.system.build.toplevel --no-link
./dot.sh diff --host orgm
```

Do not run without explicit approval.

---

## Open Questions

1. **Primary launcher:** Should `Win+Space` stay `fuzzel`, or should it be `rofi -show drun` for one visual language?
2. **HyprPanel source:** Should HyprPanel come from nixpkgs if available, existing package input if present, or a flake input?
3. **Color generator:** Choose one: `matugen`, `wallust`, or `pywal16`.
4. **Chromium app browser:** Use `chromium` only, or detect `chromium`, `google-chrome-stable`, `brave`, `zen`, in that order?
5. **Generated app persistence:** Should app maker outputs be local-only in `~/.local/share/applications`, or tracked under dotfiles after creation?

---

## Recommended First Implementation Slice

Start with Task 2 and Task 3 only:

```text
Reset Walker/Elephant out of Hyprchy, restore fuzzel speed, create clean Hyprchy v2 keybindings/autostart.
```

Then test `Win+Space`, `Win+R`, and Hyprland startup before adding bigger control center/theme/panel behavior.
