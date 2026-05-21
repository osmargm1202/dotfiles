# Code Context

## Files Retrieved

1. `config/shared/.local/bin/hypr-random-wallpaper` (lines 1-25) - current env defaults and state/runtime paths.
2. `config/shared/.local/bin/hypr-random-wallpaper` (lines 79-148) - state read/write, wallpaper discovery, ordered carousel list.
3. `config/shared/.local/bin/hypr-random-wallpaper` (lines 159-329) - hyprpaper/mpvpaper process control, static/video apply, restore.
4. `config/shared/.local/bin/hypr-random-wallpaper` (lines 331-467) - picker menu, thumbnail paths, stale thumbnail cleanup, request JSON.
5. `config/shared/.local/bin/hypr-random-wallpaper` (lines 467-650) - Quickshell data generation, lazy thumbnail warming, picker daemon.
6. `config/shared/.local/bin/hypr-random-wallpaper` (lines 654-724) - old daemon cleanup, daemon loop, CLI command dispatch.
7. `cmd/orgm-hypr/main.go` (lines 1-81) - current Go CLI entrypoint and implemented wallpaper subcommands.
8. `internal/wallpaper/data.go` (lines 1-144) - picker JSON schema and manifest-to-JSON implementation.
9. `internal/wallpaper/cleanup.go` (lines 1-38) - Go stale thumbnail cleanup.
10. `internal/paths/paths.go` (lines 1-10) - shared thumbnail path helper.
11. `config/shared/.config/quickshell/wallpaper-picker/shell.qml` (lines 1-216) - Quickshell picker state schema, request watching, warm/apply command calls.
12. `tests/hypr-random-wallpaper.bats.sh` (lines 1-537) - shell behavior coverage and migration safety expectations.
13. `tests/orgm-hypr.bats.sh` (lines 1-56) - Go smoke coverage for `wallpaper data` and `clean-thumbs`.
14. `internal/wallpaper/data_test.go` (lines 1-175) - Go unit coverage for picker data and stale thumbnail cleanup.
15. `config/shared/.config/hypr/20-autostart.conf` (lines 1-24) - autostart currently invokes `hypr-random-wallpaper`.
16. `config/shared/.config/hypr/70-keybindings.conf` (lines 1-60) - wallpaper keybind currently invokes `hypr-random-wallpaper pick`.
17. `config/shared/.config/hypr/lua/autostart.lua` (lines 1-12 via grep) - Lua Hyprland autostart also references wallpaper restore/picker-daemon.
18. `config/shared/.config/hypr/lua/keybindings.lua` (line 43 via grep) - Lua keybinding references `hypr-random-wallpaper pick`.
19. `config/shared/.config/waybar-hypr/config` (lines 155-160) - Waybar wallpaper click invokes `hypr-random-wallpaper next`.
20. `config/shared/.local/bin/hypr-tools-menu` (lines 1-14) - tools menu wallpaper entry invokes `hypr-random-wallpaper next`.
21. `config/shared/.local/bin/hypr-current-wallpaper` (lines 1-18) - lockscreen wallpaper symlink helper reads old runtime current path.
22. `nixos/profiles/hyprland.nix` (lines 136-145) - runtime deps and `orgmHypr` package are installed.
23. `nixos/packages/orgm-hypr.nix` (lines 1-28) - Nix Go package builds `cmd/orgm-hypr` with `internal`.

## Key Code

Current shell manager state paths, from `config/shared/.local/bin/hypr-random-wallpaper` lines 3-25:

```sh
static_wallpaper_dir="${HYPR_STATIC_WALLPAPER_DIR:-${HOME}/Pictures/Wallpapers}"
video_wallpaper_dir="${HYPR_VIDEO_WALLPAPER_DIR:-${HOME}/Videos/wallpapers}"
fallback="${HYPR_WALLPAPER_FALLBACK:-${HOME}/.config/wallpapers/xnm1-background.png}"
interval="${HYPR_WALLPAPER_INTERVAL:-3600}"
mpvpaper_options="${HYPR_MPV_WALLPAPER_OPTS:-no-audio loop hwdec=auto}"
mpvpaper_gpu="${HYPR_MPV_WALLPAPER_GPU:-auto}"
kill_bin="${HYPR_WALLPAPER_KILL_BIN:-kill}"

runtime_dir="${XDG_RUNTIME_DIR:-/tmp}"
state_home="${XDG_STATE_HOME:-${HOME}/.local/state}"
persistent_state_dir="${state_home}/hypr-wallpaper"
persistent_state_file="${persistent_state_dir}/state"
current_file="${runtime_dir}/hypr-random-wallpaper.current"
lock_wallpaper="${runtime_dir}/hypr-current-wallpaper"
daemon_pid_file="${runtime_dir}/hypr-random-wallpaper.daemon.pid"
mpvpaper_pid_file="${runtime_dir}/hypr-random-wallpaper.mpvpaper.pid"
hyprpaper_conf="${runtime_dir}/hypr-random-wallpaper.hyprpaper.conf"
quickshell_data="${persistent_state_dir}/wallpaper-picker.json"
quickshell_request="${persistent_state_dir}/wallpaper-picker-request.json"
quickshell_manifest="${persistent_state_dir}/wallpaper-picker.tsv"
quickshell_pid_file="${runtime_dir}/hypr-wallpaper-quickshell.pid"
quickshell_config_dir="${HYPR_WALLPAPER_QUICKSHELL_DIR:-${XDG_CONFIG_HOME:-${HOME}/.config}/quickshell/wallpaper-picker}"
```

Current shell CLI commands, from `config/shared/.local/bin/hypr-random-wallpaper` lines 682-724:

```sh
case "${1:-restore}" in
  next|change) pick_wallpaper_menu ;;
  pick) pick_wallpaper_menu ;;
  restore) restore_wallpaper ;;
  daemon) run_daemon ;;
  picker-daemon) start_quickshell_picker 0 ;;
  set-static) set_static_path "$2" static ;;
  set-video) set_video_path "$2" ;;
  carousel) open_quickshell_carousel "$2" ;;
  warm-thumbs) warm_quickshell_thumbs "$2" "${3:-0}" 5 ;;
  warm-page) warm_quickshell_page "$2" "${3:-0}" "${4:-16}" ;;
  status) printf 'mode=%s\n' "$(current_mode)"; printf 'path=%s\n' "$(state_value path 2>/dev/null || true)" ;;
esac
```

Key shell functions by line:

- `state_value`/`current_mode`/`write_state`: lines 79-98. Persistent state format is two lines: `mode=<mode>` and `path=<path>`.
- `static_wallpapers`/`video_wallpapers`: lines 100-110. Find images/videos, prune `.thumb`, sort.
- `ordered_wallpapers`: lines 120-146. Places current item first when current path exists and mode matches.
- `restart_hyprpaper`: lines 159-172. Kills `hyprpaper`, runs resolved binary or host via `distrobox-host-exec`, logs to `/tmp/hyprpaper.log`.
- `stop_mpvpaper`: lines 174-197. Reads PID file, verifies command contains `mpvpaper`, sends TERM/KILL via `$HYPR_WALLPAPER_KILL_BIN`, then scoped `pkill -f '^([^ ]+/)?(nvidia-offload )?([^ ]+/)?mpvpaper .*wallpapers'` locally and on host.
- `start_mpvpaper`: lines 205-231. Uses `nvidia-offload` if configured/available, else direct or host `distrobox-host-exec`, logs to `/tmp/mpvpaper.log`, records PID only for local branch.
- `set_static_path`: lines 252-267. Validates file, stops mpvpaper, writes hyprpaper config, restarts hyprpaper, writes runtime current file, updates lock symlink, writes persistent state.
- `set_video_path`: lines 277-291. Stops old daemon, validates file, kills hyprpaper, starts mpvpaper, ensures lock wallpaper symlink, writes persistent state.
- `restore_wallpaper`: lines 302-329. Restores persisted static/video when file exists; else falls back to random by mode.
- `generate_quickshell_data`: lines 467-550. Writes manifest, cleans stale thumbs, uses `orgm-hypr wallpaper data` if found else Python fallback, then renames temp JSON.
- `warm_quickshell_thumbs`: lines 554-574. Generates all or nearby thumbnails from manifest.
- `warm_quickshell_page`: lines 576-590. Generates page thumbnails from manifest.
- `start_quickshell_picker`: lines 606-625. Starts Quickshell with `HYPR_WALLPAPER_DATA`, `HYPR_WALLPAPER_REQUEST`, `HYPR_WALLPAPER_SHOW`, config dir.
- `open_quickshell_carousel`: lines 644-650. Generates mode JSON, copies to default data path, writes request, starts picker.
- `run_daemon`: lines 669-679. Stops old daemon, stores daemon PID, restores wallpaper, then every interval re-randomizes only when `current_mode` is `static-random`.

Current Go CLI, from `cmd/orgm-hypr/main.go` lines 18-76:

```go
func run(args []string) error {
	// implemented groups: version, wallpaper
	// other groups return "command group not implemented yet"
}

func runWallpaper(args []string) error {
	// implemented: data, clean-thumbs
	// missing full parity: pick, restore, set-static, set-video, carousel,
	// warm-thumbs, warm-page, status, daemon, picker-daemon, picker-stop/status.
}
```

Go picker data model, from `internal/wallpaper/data.go` lines 16-38:

```go
type PickerItem struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Thumb string `json:"thumb"`
}

type PickerData struct {
	Mode         string       `json:"mode"`
	Title        string       `json:"title"`
	ApplyCommand string       `json:"applyCommand"`
	Script       string       `json:"script"`
	Current      string       `json:"current"`
	Items        []PickerItem `json:"items"`
}
```

Go implemented functions:

- `GeneratePickerData(opts DataOptions)` in `internal/wallpaper/data.go` lines 58-87. Opens TSV manifest, builds data, writes indented JSON with trailing newline.
- `BuildPickerData(opts DataOptions, manifest io.Reader)` in `internal/wallpaper/data.go` lines 90-131. Reads `<mode>\t<absolute path>` rows, filters by mode, derives name and folder-local thumb path.
- `titleForMode`/`applyCommandForMode` in `internal/wallpaper/data.go` lines 133-144. Static => `Normal wallpapers`/`set-static`; video => `Live wallpapers`/`set-video`.
- `CleanStaleThumbnails(wallpaperRoot string)` in `internal/wallpaper/cleanup.go` lines 10-38. Walks root, only considers files ending `.jpg` immediately under `.thumb`, removes when source wallpaper path without `.jpg` suffix does not exist.
- `paths.ThumbPath(wallpaperPath string)` in `internal/paths/paths.go` lines 7-10. Returns `<dir>/.thumb/<basename>.jpg`.

Quickshell contract, from `config/shared/.config/quickshell/wallpaper-picker/shell.qml`:

- Defaults: `requestPath = $XDG_STATE_HOME/hypr-wallpaper/wallpaper-picker-request.json`, `dataPath = $XDG_STATE_HOME/hypr-wallpaper/wallpaper-picker.json`, default `script = hypr-random-wallpaper` (lines 8-13).
- Watches request file and reloads data path from JSON request field `dataPath` (lines 22-66).
- Data JSON schema fields used: `title`, `mode`, `applyCommand`, `script`, `current`, `items[]` (lines 13, 72-82).
- Warms current page by running `[script, "warm-page", mode, page, pageSize]` (lines 104-111).
- Applies selected item by running `[script, applyCommand, item.path]` detached (lines 212-216).

Tests to preserve/migrate:

- `tests/hypr-random-wallpaper.bats.sh` lines 108-537 covers current full behavior: video/static apply, restore, menu, carousel, lazy thumbnail generation, stale cleanup, warm-thumbs/page, scoped process cleanup, PID safety, distrobox host cleanup, current-mode filtering, NVIDIA offload.
- `tests/orgm-hypr.bats.sh` lines 1-56 covers current Go smoke only: build, version, `wallpaper data`, `wallpaper clean-thumbs`.
- `internal/wallpaper/data_test.go` lines 11-175 covers Go unit behavior for static/video picker data, invalid mode rejection, JSON write, stale cleanup.

## Architecture

Current production flow is hybrid:

1. Hyprland starts shell script:
   - `config/shared/.config/hypr/20-autostart.conf` lines 17-18 run `hypr-random-wallpaper restore` and `hypr-random-wallpaper picker-daemon`.
   - Lua equivalents exist in `config/shared/.config/hypr/lua/autostart.lua` lines 11-12.
2. User triggers menu:
   - Keybind: `config/shared/.config/hypr/70-keybindings.conf` line 34 and `config/shared/.config/hypr/lua/keybindings.lua` line 43 run `hypr-random-wallpaper pick`.
   - Waybar: `config/shared/.config/waybar-hypr/config` lines 155-160 runs `hypr-random-wallpaper next`.
   - Tools menu: `config/shared/.local/bin/hypr-tools-menu` lines 1-14 runs `hypr-random-wallpaper next`.
3. `hypr-random-wallpaper` owns wallpaper state and side effects:
   - Persistent state: `${XDG_STATE_HOME:-~/.local/state}/hypr-wallpaper/state`.
   - Runtime current static path: `${XDG_RUNTIME_DIR:-/tmp}/hypr-random-wallpaper.current`.
   - Lockscreen symlink: `${XDG_RUNTIME_DIR:-/tmp}/hypr-current-wallpaper`.
   - Daemon PID: `${XDG_RUNTIME_DIR:-/tmp}/hypr-random-wallpaper.daemon.pid`.
   - mpvpaper PID: `${XDG_RUNTIME_DIR:-/tmp}/hypr-random-wallpaper.mpvpaper.pid`.
   - hyprpaper config: `${XDG_RUNTIME_DIR:-/tmp}/hypr-random-wallpaper.hyprpaper.conf`.
   - Picker data/request/manifest: `${XDG_STATE_HOME:-~/.local/state}/hypr-wallpaper/wallpaper-picker*.json`, `wallpaper-picker.tsv`.
   - Quickshell PID: `${XDG_RUNTIME_DIR:-/tmp}/hypr-wallpaper-quickshell.pid`.
4. Quickshell picker is state-file driven:
   - Shell writes mode-specific JSON (`wallpaper-picker-static.json` or `wallpaper-picker-video.json`), copies current data to `wallpaper-picker.json`, writes request JSON with `dataPath` and `nonce`, then starts/wakes Quickshell.
   - Quickshell runs warm/apply via `data.script`; shell currently passes `--script "$0"` to Go data generator so apply/warm still call `hypr-random-wallpaper` even though JSON generation is delegated to Go.
5. Go `orgm-hypr` today is not full replacement:
   - Installed through `nixos/profiles/hyprland.nix` lines 136-145.
   - Package definition in `nixos/packages/orgm-hypr.nix` lines 1-28.
   - Implements only `orgm-hypr wallpaper data` and `orgm-hypr wallpaper clean-thumbs`.
   - Current shell script opportunistically calls these two Go subcommands, with shell/Python fallback.

Safe migration steps:

1. Preserve existing state paths first. Full replacement should read/write same persistent state file and runtime symlink/current paths so lockscreen, restore, and existing tests keep working during migration.
2. Add Go parity behind new subcommands before flipping callers:
   - `orgm-hypr wallpaper restore`
   - `orgm-hypr wallpaper pick` and/or `next`
   - `orgm-hypr wallpaper set-static PATH`
   - `orgm-hypr wallpaper set-video PATH`
   - `orgm-hypr wallpaper carousel static|video`
   - `orgm-hypr wallpaper warm-thumbs MODE [index|all]`
   - `orgm-hypr wallpaper warm-page MODE [page] [page-size]`
   - `orgm-hypr wallpaper status`
   - `orgm-hypr wallpaper daemon`
   - `orgm-hypr wallpaper picker-daemon` (plus optional `picker-status`/`picker-stop` if desired by plan docs).
3. Port behavior with tests before changing config:
   - Move Bats assertions from `tests/hypr-random-wallpaper.bats.sh` to `orgm-hypr` invocation or add a parallel Go CLI Bats suite.
   - Keep wrapper test proving `hypr-random-wallpaper` delegates to `exec orgm-hypr wallpaper "$@"` after replacement.
4. Only after Go parity passes, replace `config/shared/.local/bin/hypr-random-wallpaper` with compatibility wrapper:
   - `#!/bin/sh`
   - `exec orgm-hypr wallpaper "$@"`
     This keeps Quickshell data files with old `script` value working during staged deploy if needed.
5. Then migrate direct callers to `orgm-hypr wallpaper ...`:
   - `config/shared/.config/hypr/20-autostart.conf` lines 17-18.
   - `config/shared/.config/hypr/70-keybindings.conf` line 34.
   - `config/shared/.config/hypr/lua/autostart.lua` lines 11-12.
   - `config/shared/.config/hypr/lua/keybindings.lua` line 43.
   - `config/shared/.config/waybar-hypr/config` line 159.
   - `config/shared/.local/bin/hypr-tools-menu` line 13.
   - `config/shared/.local/bin/hypr-keybindings-help` line 145.
6. After all callers migrated and one sync cycle is verified, consider changing Quickshell default `script` from `hypr-random-wallpaper` to `orgm-hypr` in `config/shared/.config/quickshell/wallpaper-picker/shell.qml` lines 13, 108, 216. Safer alternative: keep wrapper forever and leave default as compatibility.
7. Keep `hypr-current-wallpaper` compatibility or migrate it with care. `config/shared/.local/bin/hypr-current-wallpaper` lines 1-18 reads `${XDG_RUNTIME_DIR}/hypr-random-wallpaper.current` and writes `${XDG_RUNTIME_DIR}/hypr-current-wallpaper`; `hyprlock.conf` line 7 uses the symlink.
8. Keep runtime deps until Go fully replaces fallback paths: `hyprpaper`, `mpvpaper`, `quickshell`, `ffmpeg`, `python3Minimal`, `orgmHypr` are all installed in `nixos/profiles/hyprland.nix` lines 136-145. Python can go only after shell fallback is gone.

Risks / constraints:

- Repo already has modified files before this scout: `config/shared/.config/quickshell/wallpaper-picker/shell.qml`, `config/shared/.local/bin/hypr-random-wallpaper`, `tests/hypr-random-wallpaper.bats.sh`. Do not assume clean baseline.
- `hypr-random-wallpaper` default command is `restore` when no args are given. `orgm-hypr wallpaper` currently errors without subcommand. Wrapper replacement must preserve desired no-arg behavior or callers must always pass explicit command.
- Process cleanup must stay scoped. Tests explicitly forbid broad `pkill -x mpvpaper`; Go port should verify PID command before kill and keep scoped regex behavior.
- `distrobox-host-exec` branches matter because current runtime is in podman/distrobox-like environment; shell supports host-side `hyprpaper`, `mpvpaper`, and cleanup.
- `quickshell_data` default path and mode-specific JSON/request protocol must stay compatible with existing Quickshell watcher.
- Go `CleanStaleThumbnails` treats only immediate files under `.thumb`; test preserves files under `.thumb/album`.
- Go `wallpaper data` defaults `Script` to `orgm-hypr`, but shell currently passes `$0`. Once migrated, generated JSON script should be `orgm-hypr` if direct replacement is desired.

Open questions:

- Should direct configs call `orgm-hypr wallpaper ...` everywhere, or should old script name remain as permanent compatibility API?
- Should runtime file names keep `hypr-random-wallpaper.*` forever for compatibility, or move to `orgm-hypr-wallpaper.*` with migration fallback reads?
- Should `orgm-hypr wallpaper daemon` preserve static-random-only interval behavior exactly, or add video rotation?
- Should `picker-daemon` stay as Quickshell process launcher, or should Go become resident daemon managing picker IPC?

## Start Here

Open `config/shared/.local/bin/hypr-random-wallpaper` first. It is current source of truth for behavior, env vars, state paths, process safety, picker protocol, and CLI surface that `orgm-hypr wallpaper` must replace.

Then open `cmd/orgm-hypr/main.go` and `internal/wallpaper/data.go` to see current Go gap: only data generation and thumbnail cleanup exist today.

Engram note: no Engram/memory tool is available in this subagent toolset, so important discoveries could not be saved there.
