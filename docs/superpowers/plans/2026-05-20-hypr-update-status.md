# Hypr Update Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add check-only update status for NixOS, Distrobox Arch, Pi, and Flatpak, expose it in Waybar, and keep updates manual through Hyprland rofi menus.

**Architecture:** One shared status script owns checks, state, Waybar JSON, and summaries. A Hyprland `exec-once` daemon (`hypr-update-daemon`) starts with the Hyprland session, refreshes status every 10 minutes, and lets the status script internally throttle expensive sources. `hypr-update-menu` remains the manual update entrypoint and wraps every update with notifications.

**Amendment 2026-05-20:** Earlier systemd-unit scheduling design was replaced with the Hyprland-started daemon so activation happens through dotfile sync plus Hyprland autostart, with no enablement step.

**Tech Stack:** Bash, fish, fnm, distrobox, paru/checkupdates, flatpak, nh/Nix flakes, jq, notify-send, Hyprland `exec-once`, Waybar custom JSON modules, rofi.

**Safety:** Do not commit during execution unless the user explicitly asks. Do not enable auto-updates. Manual update commands may mutate system/user packages only when user clicks menu action.

---

## File Structure

### Create

- `config/shared/.local/bin/hypr-update-status`
  - Single source of truth for update checks, state file, Waybar JSON, and menu summary.
  - Writes state to `${XDG_STATE_HOME:-$HOME/.local/state}/hypr-updates/status.json`.
  - Writes logs to `${XDG_CACHE_HOME:-$HOME/.cache}/hypr-updates/logs/status.log`.
  - Uses a lock directory so overlapping refresh runs exit safely.

- `config/shared/.local/bin/hypr-update-daemon`
  - Hyprland-session daemon that runs `hypr-update-status refresh` immediately and then every 10 minutes.
  - Writes logs to `${XDG_CACHE_HOME:-$HOME/.cache}/hypr-updates/logs/daemon.log`.
  - Uses a lock directory so only one daemon loop runs per session.

### Modify

- `config/shared/.local/bin/hypr-update-menu`
  - Replace NixOS-only menu with nested manual update menu.
  - Actions: Status, Check now, NixOS, Flatpak, Distrobox Arch packages, Pi.
  - Each update action sends start/end/fail notifications and refreshes status afterward.

- `config/shared/.config/waybar-hypr/config`
  - Add `custom/updates` to top-right modules.
  - Configure it to call `hypr-update-status waybar` and open `hypr-update-menu` on click.

- `config/shared/.config/waybar-hypr/style.css`
  - Add styling for `#custom-updates` and classes: `ok`, `pending`, `checking`, `error`, `unknown`.

- `config/shared/.config/hypr/20-autostart.conf`
  - Add `exec-once = sh -lc '$HOME/.local/bin/hypr-update-daemon'` near the Waybar autostart entry.

### Read-only awareness

- `nixos/common.nix`
  - Existing `system.autoUpgrade.enable = true` conflicts with the desired “manual NixOS updates” behavior. Do not change it in this plan. Surface it in final handoff and ask user whether to disable it in a separate change.

---

## State Schema

`hypr-update-status refresh` writes this shape:

```json
{
  "checked_at": "2026-05-20T00:00:00-04:00",
  "sources": {
    "nixos": {
      "label": "nx",
      "state": "ok",
      "pending": 0,
      "checked_at": "2026-05-20T00:00:00-04:00",
      "detail": "flake inputs current or no dry-run changes detected"
    },
    "distrobox": {
      "label": "db",
      "state": "pending",
      "pending": 3,
      "checked_at": "2026-05-20T00:00:00-04:00",
      "detail": "2 repo, 1 aur"
    },
    "pi": {
      "label": "pi",
      "state": "ok",
      "pending": 0,
      "checked_at": "2026-05-20T00:00:00-04:00",
      "detail": "installed 1.2.3, latest 1.2.3"
    },
    "flatpak": {
      "label": "fp",
      "state": "pending",
      "pending": 4,
      "checked_at": "2026-05-20T00:00:00-04:00",
      "detail": "4 updates"
    }
  }
}
```

Allowed `state` values:

- `ok`: source checked and has no pending updates.
- `pending`: source checked and has pending updates.
- `checking`: check currently running.
- `error`: command failed or dependency missing.
- `unknown`: no state yet or unsupported check.

Waybar text should be compact:

```text
nx ✓ db 󰅐 pi ✓ fp 󰅐
```

Class selection:

- any source `error` => `error`
- else any source `pending` => `pending`
- else any source `checking` => `checking`
- else all known `ok` => `ok`
- else `unknown`

---

## Task 1: Add Status Script

**Files:**

- Create: `config/shared/.local/bin/hypr-update-status`

- [ ] **Step 1: Create the script with command dispatch**

Create `config/shared/.local/bin/hypr-update-status` with this structure:

```bash
#!/usr/bin/env bash
set -euo pipefail

state_dir="${XDG_STATE_HOME:-$HOME/.local/state}/hypr-updates"
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/hypr-updates"
log_dir="$cache_dir/logs"
status_file="$state_dir/status.json"
lock_dir="$state_dir/status.lock"
repo="${DOTFILES_REPO:-$HOME/Hobby/dotfiles}"
host="${HYPR_HOST:-$(hostname)}"
profile="${HYPR_PROFILE:-hyprland}"
target="${HYPR_UPDATE_TARGET:-$host-$profile}"

mkdir -p "$state_dir" "$log_dir"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*" >> "$log_dir/status.log"
}

json_string() {
  jq -Rn --arg value "$1" '$value'
}

source_json() {
  local label="$1" state="$2" pending="$3" detail="$4"
  jq -n \
    --arg label "$label" \
    --arg state "$state" \
    --argjson pending "${pending:-0}" \
    --arg checked_at "$(date -Is)" \
    --arg detail "$detail" \
    '{label:$label,state:$state,pending:$pending,checked_at:$checked_at,detail:$detail}'
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

read_source_checked_epoch() {
  local source="$1"
  if [ ! -f "$status_file" ]; then
    echo 0
    return
  fi
  local checked_at
  checked_at="$(jq -r --arg source "$source" '.sources[$source].checked_at // empty' "$status_file" 2>/dev/null || true)"
  if [ -z "$checked_at" ]; then
    echo 0
    return
  fi
  date -d "$checked_at" +%s 2>/dev/null || echo 0
}

is_due() {
  local source="$1" interval_seconds="$2" force="${3:-false}"
  if [ "$force" = "true" ]; then
    return 0
  fi
  local last now
  last="$(read_source_checked_epoch "$source")"
  now="$(date +%s)"
  [ $((now - last)) -ge "$interval_seconds" ]
}

existing_or_unknown() {
  local source="$1" label="$2" detail="$3"
  if [ -f "$status_file" ] && jq -e --arg source "$source" '.sources[$source]' "$status_file" >/dev/null 2>&1; then
    jq --arg source "$source" '.sources[$source]' "$status_file"
  else
    source_json "$label" unknown 0 "$detail"
  fi
}

check_nixos() {
  if ! command_exists nix; then
    source_json nx unknown 0 "nix command not available"
    return
  fi
  if [ ! -d "$repo" ]; then
    source_json nx error 0 "dotfiles repo missing: $repo"
    return
  fi

  local output rc
  set +e
  output="$(cd "$repo" && nix flake update --dry-run 2>&1)"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    source_json nx unknown 0 "nix dry-run unsupported or failed"
    log "nixos check failed rc=$rc: $output"
    return
  fi

  if printf '%s\n' "$output" | grep -Eiq 'would update|will update|updated input|warning: updating'; then
    source_json nx pending 1 "flake inputs have dry-run changes"
  else
    source_json nx ok 0 "no flake dry-run changes detected"
  fi
}

check_flatpak() {
  if ! command_exists flatpak; then
    source_json fp unknown 0 "flatpak command not available"
    return
  fi

  local output rc count
  set +e
  output="$(flatpak remote-ls --updates --columns=application,branch,origin,version 2>&1)"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    source_json fp error 0 "flatpak check failed"
    log "flatpak check failed rc=$rc: $output"
    return
  fi

  count="$(printf '%s\n' "$output" | sed '/^[[:space:]]*$/d' | wc -l)"
  if [ "$count" -gt 0 ]; then
    source_json fp pending "$count" "$count flatpak updates"
  else
    source_json fp ok 0 "flatpak current"
  fi
}

check_distrobox() {
  if ! command_exists distrobox-enter; then
    source_json db unknown 0 "distrobox-enter command not available"
    return
  fi

  local output rc repo_count aur_count total
  set +e
  output="$(distrobox-enter arch -- fish -lc '
    set repo_count 0
    set aur_count 0
    if type -q checkupdates
      set repo_count (checkupdates 2>/dev/null | wc -l | string trim)
    else if type -q paru
      set repo_count (paru -Quq 2>/dev/null | wc -l | string trim)
    end
    if type -q paru
      set aur_count (paru -Qua --color=never 2>/dev/null | wc -l | string trim)
    end
    echo repo=$repo_count aur=$aur_count
  ' 2>&1)"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    source_json db error 0 "distrobox arch check failed"
    log "distrobox check failed rc=$rc: $output"
    return
  fi

  repo_count="$(printf '%s' "$output" | sed -n 's/.*repo=\([0-9][0-9]*\).*/\1/p' | tail -n1)"
  aur_count="$(printf '%s' "$output" | sed -n 's/.*aur=\([0-9][0-9]*\).*/\1/p' | tail -n1)"
  repo_count="${repo_count:-0}"
  aur_count="${aur_count:-0}"
  total=$((repo_count + aur_count))

  if [ "$total" -gt 0 ]; then
    source_json db pending "$total" "$repo_count repo, $aur_count aur"
  else
    source_json db ok 0 "arch distrobox current"
  fi
}

check_pi() {
  if ! command_exists distrobox-enter; then
    source_json pi unknown 0 "distrobox-enter command not available"
    return
  fi

  local output rc current latest
  set +e
  output="$(distrobox-enter arch -- fish -lc '
    if type -q fnm
      fnm env --shell fish | source
    end
    set current ""
    set latest ""
    if type -q pi
      set current (command pi --version 2>/dev/null | string match -r "[0-9]+(\\.[0-9]+)+" | head -n1)
    end
    if type -q npm
      set latest (npm view @earendil-works/pi-coding-agent version 2>/dev/null | string trim)
    end
    echo current=$current latest=$latest
  ' 2>&1)"
  rc=$?
  set -e

  if [ "$rc" -ne 0 ]; then
    source_json pi error 0 "pi/npm version check failed"
    log "pi check failed rc=$rc: $output"
    return
  fi

  current="$(printf '%s' "$output" | sed -n 's/.*current=\([^[:space:]]*\).*/\1/p' | tail -n1)"
  latest="$(printf '%s' "$output" | sed -n 's/.*latest=\([^[:space:]]*\).*/\1/p' | tail -n1)"

  if [ -z "$current" ] || [ -z "$latest" ]; then
    source_json pi unknown 0 "current or latest pi version unavailable"
  elif [ "$current" != "$latest" ]; then
    source_json pi pending 1 "installed $current, latest $latest"
  else
    source_json pi ok 0 "installed $current, latest $latest"
  fi
}

build_status() {
  local force="${1:-false}"
  local nixos_json distrobox_json pi_json flatpak_json

  if is_due nixos 21600 "$force"; then
    nixos_json="$(check_nixos)"
  else
    nixos_json="$(existing_or_unknown nixos nx "nixos not checked yet")"
  fi

  if is_due distrobox 7200 "$force"; then
    distrobox_json="$(check_distrobox)"
  else
    distrobox_json="$(existing_or_unknown distrobox db "distrobox not checked yet")"
  fi

  if is_due pi 600 "$force"; then
    pi_json="$(check_pi)"
  else
    pi_json="$(existing_or_unknown pi pi "pi not checked yet")"
  fi

  if is_due flatpak 7200 "$force"; then
    flatpak_json="$(check_flatpak)"
  else
    flatpak_json="$(existing_or_unknown flatpak fp "flatpak not checked yet")"
  fi

  jq -n \
    --arg checked_at "$(date -Is)" \
    --argjson nixos "$nixos_json" \
    --argjson distrobox "$distrobox_json" \
    --argjson pi "$pi_json" \
    --argjson flatpak "$flatpak_json" \
    '{checked_at:$checked_at,sources:{nixos:$nixos,distrobox:$distrobox,pi:$pi,flatpak:$flatpak}}'
}

refresh() {
  local force="${1:-false}"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    log "refresh skipped: lock held"
    exit 0
  fi
  trap 'rmdir "$lock_dir" 2>/dev/null || true' EXIT

  local tmp
  tmp="$(mktemp "$state_dir/status.XXXXXX")"
  build_status "$force" > "$tmp"
  jq . "$tmp" > "$status_file"
  rm -f "$tmp"
  log "refresh complete"
}

state_icon() {
  case "$1" in
    ok) echo "✓" ;;
    pending) echo "󰅐" ;;
    checking) echo "󰔟" ;;
    error) echo "" ;;
    *) echo "?" ;;
  esac
}

waybar() {
  if [ ! -f "$status_file" ]; then
    jq -n '{text:"nx ? db ? pi ? fp ?",tooltip:"Update status unavailable. Click to open update menu.",class:"unknown"}'
    return
  fi

  local text tooltip class
  text="$(jq -r '.sources | [.nixos,.distrobox,.pi,.flatpak] | map(.label + " " + .state) | join(" ")' "$status_file")"
  text="${text// ok/ ✓}"
  text="${text// pending/ 󰅐}"
  text="${text// checking/ 󰔟}"
  text="${text// error/ }"
  text="${text// unknown/ ?}"

  tooltip="$(jq -r '.sources | [.nixos,.distrobox,.pi,.flatpak] | map(.label + ": " + .state + " (" + (.pending|tostring) + ") - " + .detail) | join("\n")' "$status_file")"

  if jq -e '.sources | to_entries | any(.value.state == "error")' "$status_file" >/dev/null; then
    class="error"
  elif jq -e '.sources | to_entries | any(.value.state == "pending")' "$status_file" >/dev/null; then
    class="pending"
  elif jq -e '.sources | to_entries | any(.value.state == "checking")' "$status_file" >/dev/null; then
    class="checking"
  elif jq -e '.sources | to_entries | all(.value.state == "ok")' "$status_file" >/dev/null; then
    class="ok"
  else
    class="unknown"
  fi

  jq -n --arg text "$text" --arg tooltip "$tooltip" --arg class "$class" '{text:$text,tooltip:$tooltip,class:$class}'
}

summary() {
  if [ ! -f "$status_file" ]; then
    echo "Update status unavailable. Run Check now."
    return
  fi
  jq -r '.sources | [.nixos,.distrobox,.pi,.flatpak] | map(.label + ": " + .state + " (" + (.pending|tostring) + ") - " + .detail) | join("\n")' "$status_file"
}

case "${1:-waybar}" in
  refresh)
    refresh "${2:-false}"
    ;;
  force|check-now)
    refresh true
    ;;
  waybar)
    waybar
    ;;
  summary)
    summary
    ;;
  *)
    echo "Usage: hypr-update-status [refresh|force|check-now|waybar|summary]" >&2
    exit 2
    ;;
esac
```

- [ ] **Step 2: Make executable**

Run:

```bash
chmod +x config/shared/.local/bin/hypr-update-status
```

Expected: no output.

- [ ] **Step 3: Validate syntax**

Run:

```bash
bash -n config/shared/.local/bin/hypr-update-status
```

Expected: exit 0, no output.

- [ ] **Step 4: Validate Waybar JSON fallback**

Run:

```bash
XDG_STATE_HOME="$(mktemp -d)" config/shared/.local/bin/hypr-update-status waybar | jq .
```

Expected JSON like:

```json
{
  "text": "nx ? db ? pi ? fp ?",
  "tooltip": "Update status unavailable. Click to open update menu.",
  "class": "unknown"
}
```

---

## Task 2: Expand Hypr Update Menu

**Files:**

- Modify: `config/shared/.local/bin/hypr-update-menu`

- [ ] **Step 1: Replace NixOS-only menu with manual submenu**

Replace entire `config/shared/.local/bin/hypr-update-menu` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

theme="${HYPR_ROFI_THEME:-$HOME/.config/rofi/hypr-menu.rasi}"
repo="${DOTFILES_REPO:-$HOME/Hobby/dotfiles}"
host="${HYPR_HOST:-$(hostname)}"
profile="${HYPR_PROFILE:-hyprland}"
target="${HYPR_UPDATE_TARGET:-$host-$profile}"
status_bin="${HYPR_UPDATE_STATUS_BIN:-$HOME/.local/bin/hypr-update-status}"
terminal="${HYPR_TERMINAL:-kitty}"

notify() {
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "$@" || true
  fi
}

pick() {
  rofi -dmenu -i -show-icons -p "$1" -theme "$theme"
}

run_terminal() {
  local title="$1" command="$2"
  exec "$terminal" --class hypr-update -T "$title" -e sh -lc "$command"
}

wrap_update() {
  local label="$1" command="$2"
  printf '%s' "notify-send 'ORGM Update' '$label started' 2>/dev/null || true; "
  printf '%s' "$command"
  printf '%s' "; rc=\$?; "
  printf '%s' "if [ \$rc -eq 0 ]; then notify-send 'ORGM Update' '$label finished' 2>/dev/null || true; else notify-send -u critical 'ORGM Update' '$label failed' 2>/dev/null || true; fi; "
  printf '%s' "'$status_bin' force >/dev/null 2>&1 || true; "
  printf '%s' "echo; read -r -p 'press enter...'; exit \$rc"
}

show_status() {
  local summary
  if [ -x "$status_bin" ]; then
    summary="$($status_bin summary 2>/dev/null || true)"
  else
    summary="hypr-update-status not installed yet"
  fi
  printf '%s\n' "$summary" "" "Check now" "Back" | pick 'Update Status' || true
}

main_choice="$(printf '%s\n' \
  '󰜉 Status' \
  '󰑓 Check now' \
  ' NixOS host' \
  '󰏖 Flatpak' \
  ' Distrobox Arch packages' \
  '󰚩 Pi coding agent' \
  '󰅖 Cancel' | pick 'Updates' || true)"

case "$main_choice" in
  *'Status')
    choice="$(show_status)"
    case "$choice" in
      'Check now') run_terminal 'Check updates' "'$status_bin' force; echo; '$status_bin' summary; echo; read -r -p 'press enter...'" ;;
      *) exit 0 ;;
    esac
    ;;
  *'Check now')
    run_terminal 'Check updates' "'$status_bin' force; echo; '$status_bin' summary; echo; read -r -p 'press enter...'"
    ;;
  *'NixOS host')
    run_terminal 'NixOS update' "$(wrap_update "NixOS $target" "cd '$repo' && nh os switch .#$target --update")"
    ;;
  *'Flatpak')
    run_terminal 'Flatpak update' "$(wrap_update 'Flatpak' "flatpak update")"
    ;;
  *'Distrobox Arch packages')
    run_terminal 'Distrobox Arch update' "$(wrap_update 'Distrobox Arch' "distrobox-enter arch -- fish -lc 'paru -Syu'")"
    ;;
  *'Pi coding agent')
    run_terminal 'Pi update' "$(wrap_update 'Pi coding agent' "distrobox-enter arch -- fish -lc 'if type -q fnm; fnm env --shell fish | source; end; pi update || npm i -g @earendil-works/pi-coding-agent'")"
    ;;
  *'Cancel'|'')
    exit 0
    ;;
esac
```

- [ ] **Step 2: Validate menu script syntax**

Run:

```bash
bash -n config/shared/.local/bin/hypr-update-menu
```

Expected: exit 0, no output.

- [ ] **Step 3: Verify main menu still points to this file**

Run:

```bash
grep -n "hypr-update-menu" config/shared/.local/bin/hypr-main-menu
```

Expected output includes:

```text
*'Update') exec "$bin_dir/hypr-update-menu" ;;
```

No change needed in `hypr-main-menu` if that line exists.

---

## Task 3: Add Hyprland Update Daemon

**Files:**

- Create: `config/shared/.local/bin/hypr-update-daemon`
- Modify: `config/shared/.config/hypr/20-autostart.conf`

- [ ] **Step 1: Create daemon script**

Create `config/shared/.local/bin/hypr-update-daemon` as an executable Bash script.

Expected behavior:

- Uses `${XDG_STATE_HOME:-$HOME/.local/state}/hypr-updates/daemon.lock` so only one daemon loop runs.
- Writes logs to `${XDG_CACHE_HOME:-$HOME/.cache}/hypr-updates/logs/daemon.log`.
- Runs `${HYPR_UPDATE_STATUS_BIN:-$HOME/.local/bin/hypr-update-status} refresh` immediately.
- Sleeps `${HYPR_UPDATE_DAEMON_INTERVAL:-600}` seconds between refreshes.
- Recovers stale daemon locks and exits cleanly when an existing daemon PID is alive.

- [ ] **Step 2: Add Hyprland autostart**

In `config/shared/.config/hypr/20-autostart.conf`, add this line near the Waybar autostart entry:

```ini
exec-once = sh -lc '$HOME/.local/bin/hypr-update-daemon'
```

No systemd unit creation or enablement is part of the final design.

- [ ] **Step 3: Validate daemon and autostart**

Run:

```bash
bash -n config/shared/.local/bin/hypr-update-daemon
grep -n "hypr-update-daemon" config/shared/.config/hypr/20-autostart.conf
```

Expected: Bash syntax check exits 0, and grep shows the `exec-once` line.

---

## Task 4: Add Waybar Update Module

**Files:**

- Modify: `config/shared/.config/waybar-hypr/config`
- Modify: `config/shared/.config/waybar-hypr/style.css`

- [ ] **Step 1: Add module to top-right list**

In `config/shared/.config/waybar-hypr/config`, add `custom/updates` before `custom/wallpaper` in the top bar `modules-right` list.

Expected list:

```json
    "modules-right": [
      "custom/updates",
      "custom/wallpaper",
      "bluetooth",
      "network",
      "privacy",
      "tray",
      "custom/logout_menu"
    ],
```

- [ ] **Step 2: Add module config**

Add this object near other `custom/*` module definitions, before `custom/wallpaper`:

```json
    "custom/updates": {
      "exec": "~/.local/bin/hypr-update-status waybar",
      "return-type": "json",
      "interval": 60,
      "format": "{}",
      "tooltip": true,
      "on-click": "~/.local/bin/hypr-update-menu"
    },
```

- [ ] **Step 3: Validate Waybar JSON**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const file = 'config/shared/.config/waybar-hypr/config';
const raw = fs.readFileSync(file, 'utf8').replace(/^\/\/.*\n/, '');
JSON.parse(raw);
console.log('waybar-hypr config JSON ok');
NODE
```

Expected:

```text
waybar-hypr config JSON ok
```

- [ ] **Step 4: Add CSS for update module**

In `config/shared/.config/waybar-hypr/style.css`, include `#custom-updates` in the transparent module list:

```css
#custom-wallpaper,
#custom-updates,
#bluetooth,
#network,
#privacy,
#tray,
#custom-logout_menu,
#custom-user,
#window,
#mpris,
#backlight,
#pulseaudio,
#battery,
#custom-kbd_layout,
#cpu,
#memory,
#temperature,
#disk,
#custom-swap {
  background: transparent;
}
```

Then add below the module color rules:

```css
#custom-updates {
  color: @subtext0;
  font-weight: bold;
  padding: 0 8px;
}
#custom-updates.ok {
  color: @green;
}
#custom-updates.pending {
  color: @yellow;
}
#custom-updates.checking {
  color: @blue;
}
#custom-updates.error {
  color: @red;
}
#custom-updates.unknown {
  color: @overlay0;
}
```

- [ ] **Step 5: Restart Waybar manually on host**

Host-only command:

```bash
pkill waybar || true
waybar -c ~/.config/waybar-hypr/config -s ~/.config/waybar-hypr/style.css &
```

Expected: Waybar starts and top-right shows `nx ? db ? pi ? fp ?` until first check completes.

---

## Task 5: dot.sh Diff and Host Activation

**Files:**

- No new code files beyond previous tasks.

- [ ] **Step 1: Check tracked dotfile diff**

Run:

```bash
./dot.sh diff --host lenovo
```

Expected: diff shows new/changed files under. If applying on another machine, replace `lenovo` with that host name:

```text
.local/bin/hypr-update-status
.local/bin/hypr-update-daemon
.local/bin/hypr-update-menu
.config/hypr/20-autostart.conf
.config/waybar-hypr/config
.config/waybar-hypr/style.css
```

- [ ] **Step 2: Sync to host home when user approves**

Run only after user approves applying dotfiles:

```bash
./dot.sh sync --host lenovo
```

Expected: files copied/symlinked into home according to dot.sh behavior.

- [ ] **Step 3: Start daemon on host**

Preferred path after `./dot.sh sync --host lenovo`: restart Hyprland so `exec-once` starts the daemon.

For immediate activation without restarting Hyprland, run the daemon directly on the host:

```bash
~/.local/bin/hypr-update-daemon
```

Expected: daemon starts, performs an immediate check-only refresh, then repeats every 10 minutes while the process remains running.

- [ ] **Step 4: Force first check on host**

Host-only command:

```bash
~/.local/bin/hypr-update-status force
~/.local/bin/hypr-update-status summary
~/.local/bin/hypr-update-status waybar | jq .
```

Expected:

- Summary prints `nx`, `db`, `pi`, and `fp` rows.
- Waybar JSON contains `text`, `tooltip`, and `class`.
- Missing host-only dependencies produce `unknown`, not script failure.

---

## Task 6: Final Verification and Risk Handoff

**Files:**

- Review all changed files.

- [ ] **Step 1: Run local syntax checks**

Run:

```bash
bash -n config/shared/.local/bin/hypr-update-status
bash -n config/shared/.local/bin/hypr-update-menu
bash -n config/shared/.local/bin/hypr-update-daemon
node - <<'NODE'
const fs = require('fs');
const raw = fs.readFileSync('config/shared/.config/waybar-hypr/config', 'utf8').replace(/^\/\/.*\n/, '');
JSON.parse(raw);
console.log('waybar json ok');
NODE
grep -n "hypr-update-daemon" config/shared/.config/hypr/20-autostart.conf
```

Expected:

```text
waybar json ok
```

Other commands exit 0, and grep shows the Hyprland `exec-once` daemon line.

- [ ] **Step 2: Inspect git diff**

Run:

```bash
git diff -- config/shared/.local/bin/hypr-update-status \
  config/shared/.local/bin/hypr-update-menu \
  config/shared/.local/bin/hypr-update-daemon \
  config/shared/.config/hypr/20-autostart.conf \
  config/shared/.config/waybar-hypr/config \
  config/shared/.config/waybar-hypr/style.css
```

Expected:

- No unrelated edits.
- No auto-update behavior in the daemon.
- Update commands only run through menu actions.

- [ ] **Step 3: Report known conflict**

Final handoff must mention:

```text
nixos/common.nix already enables system.autoUpgrade weekly. Option B keeps new Hypr updater manual-only, but existing NixOS autoUpgrade remains active unless user asks to disable it.
```

- [ ] **Step 4: Ask before commit**

Do not commit automatically. Ask user:

```text
Cambios verificados. ¿Querés que haga commit?
```

---

## Acceptance Criteria

- Waybar shows one compact update status module with NixOS, Distrobox, Pi, and Flatpak.
- Hyprland-started daemon performs check-only refreshes every 10 minutes.
- No systemd timer is part of the final design.
- Expensive checks are throttled internally: Pi 10 min, Distrobox 2 h, Flatpak 2 h, NixOS 6 h.
- Manual update menu has actions for NixOS, Flatpak, Distrobox Arch packages, and Pi.
- Manual update actions notify start/end/failure.
- Pi check/update runs inside Arch distrobox with fish/fnm, not as a plain host npm command.
- Missing commands produce `unknown` or `error` state without breaking Waybar.
- No new automatic update behavior is introduced.

## Non-Goals

- Disable existing `system.autoUpgrade` in `nixos/common.nix`.
- Auto-update Flatpak, paru, Pi, or NixOS.
- Support non-Arch distrobox names.
- Build a GUI beyond rofi/Waybar.
- Add root-level schedulers or automatic update services.

## Review Notes

- Fresh reviewer should check Bash quoting carefully, especially nested fish commands in `hypr-update-menu` and `hypr-update-status`.
- Fresh reviewer should verify Waybar JSON remains valid after edits.
- Fresh reviewer should confirm Hyprland autostart starts `hypr-update-daemon` and no stale systemd unit instructions remain.
