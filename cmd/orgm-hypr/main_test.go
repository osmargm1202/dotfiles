package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/osmarg/dotfiles/orgm-hypr/internal/cli"
)

func TestRunWithIOVersionWritesCurrentDevVersion(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"version"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(version) error = %v", err)
	}
	if got, want := stdout.String(), "orgm-hypr dev\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOReportsUsageForMissingCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO(nil, &stdout, &stderr)

	assertUsageError(t, err, usage())
	if got := stdout.String(); got != "" {
		t.Fatalf("stdout = %q, want empty", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty before PrintError", got)
	}
}

func TestRunWithIOCurrentPlaceholderGroupsReturnNotImplemented(t *testing.T) {
	groups := []string{"updates", "notify"}

	for _, group := range groups {
		t.Run(group, func(t *testing.T) {
			var stdout, stderr bytes.Buffer

			err := runWithIO([]string{group}, &stdout, &stderr)

			assertUsageError(t, err, group+": command group not implemented yet")
			if got := stdout.String(); got != "" {
				t.Fatalf("stdout = %q, want empty", got)
			}
			if got := stderr.String(); got != "" {
				t.Fatalf("stderr = %q, want empty before PrintError", got)
			}
		})
	}
}

func TestRunWithIOThemeListPrintsThemesAndModes(t *testing.T) {
	registryPath := writeCLIRegistry(t)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"theme", "list", "--registry", registryPath}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(theme list) error = %v", err)
	}
	if got, want := stdout.String(), "neutral\tNeutral\tdark,light\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOThemeListDefaultsRegistryToXDGConfigHome(t *testing.T) {
	workDir := t.TempDir()
	t.Chdir(workDir)
	configHome := filepath.Join(t.TempDir(), "xdg-config")
	registryPath := filepath.Join(configHome, "orgm-hypr", "themes.json")
	writeCLIRegistryAt(t, registryPath)
	t.Setenv("XDG_CONFIG_HOME", configHome)
	t.Setenv("HOME", filepath.Join(t.TempDir(), "home"))
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"theme", "list"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(theme list) error = %v", err)
	}
	if got, want := stdout.String(), "neutral\tNeutral\tdark,light\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOThemeListDefaultsRegistryToHomeConfigWhenXDGConfigHomeUnset(t *testing.T) {
	workDir := t.TempDir()
	t.Chdir(workDir)
	home := filepath.Join(t.TempDir(), "home")
	registryPath := filepath.Join(home, ".config", "orgm-hypr", "themes.json")
	writeCLIRegistryAt(t, registryPath)
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("HOME", home)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"theme", "list"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(theme list) error = %v", err)
	}
	if got, want := stdout.String(), "neutral\tNeutral\tdark,light\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOThemeValidateReportsValidRegistry(t *testing.T) {
	registryPath := writeCLIRegistry(t)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"theme", "validate", "--registry", registryPath}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(theme validate) error = %v", err)
	}
	if got, want := stdout.String(), "valid: 1 theme(s)\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOThemeStatusReportsNoAppliedThemeYet(t *testing.T) {
	registryPath := writeCLIRegistry(t)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"theme", "status", "--registry", registryPath}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(theme status) error = %v", err)
	}
	want := "active=neutral\nmode=dark\nwallpaper=current\nlastApply=none\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOThemePreviewPrintsApplyPlanWithRegistryOverride(t *testing.T) {
	registryPath := writeCLIRegistry(t)
	env := writeThemeCommandEnv(t)
	var stdout, stderr bytes.Buffer

	err := runThemeWithEnv([]string{"preview", "neutral", "--registry", registryPath}, &stdout, &stderr, env)

	if err != nil {
		t.Fatalf("runThemeWithEnv(theme preview) error = %v", err)
	}
	wantParts := []string{
		"theme=neutral\nmode=dark\n",
		"Writes:\n  " + filepath.Join(env.StateHome, "orgm-hypr", "theme", "current", "palette.json") + "\n",
		"Reloads:\n  hypr: hyprctl reload\n",
		"Warnings:\n  chromium target placeholder: export renderer not implemented in this slice\n  zen target placeholder: export renderer not implemented in this slice\n",
	}
	for _, want := range wantParts {
		if got := stdout.String(); !strings.Contains(got, want) {
			t.Fatalf("stdout = %q, want substring %q", got, want)
		}
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOThemeApplyDryRunPrintsPlanAndDoesNotWrite(t *testing.T) {
	registryPath := writeCLIRegistry(t)
	env := writeThemeCommandEnv(t)
	writePath := filepath.Join(env.StateHome, "orgm-hypr", "theme", "current", "palette.json")
	var stdout, stderr bytes.Buffer

	err := runThemeWithEnv([]string{"apply", "neutral", "--dry-run", "--registry", registryPath}, &stdout, &stderr, env)

	if err != nil {
		t.Fatalf("runThemeWithEnv(theme apply --dry-run) error = %v", err)
	}
	if got := stdout.String(); !strings.Contains(got, "dryRun=true\n") || !strings.Contains(got, "Writes:\n  "+writePath+"\n") {
		t.Fatalf("stdout = %q, want dry-run plan with write path %q", got, writePath)
	}
	if _, statErr := os.Stat(writePath); !os.IsNotExist(statErr) {
		t.Fatalf("dry-run write path stat error = %v, want not exist", statErr)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunThemePreviewRendersConfigHomeDesktopTargetWrites(t *testing.T) {
	registryPath := writeCLIRegistryWithTargets(t, map[string]map[string]string{"waybar": {"mode": "generated"}, "gtk": {"mode": "generated"}, "qt": {"mode": "generated"}})
	env := writeThemeCommandEnv(t)
	var stdout, stderr bytes.Buffer

	err := runThemeWithEnv([]string{"preview", "neutral", "--registry", registryPath}, &stdout, &stderr, env)

	if err != nil {
		t.Fatalf("runThemeWithEnv(theme preview) error = %v", err)
	}
	wantParts := []string{
		filepath.Join(env.ConfigHome, "waybar-hypr", "orgm-hypr-theme.css"),
		filepath.Join(env.ConfigHome, "gtk-3.0", "orgm-hypr-settings.ini"),
		filepath.Join(env.ConfigHome, "qt5ct", "colors", "orgm-hypr.colors"),
	}
	for _, want := range wantParts {
		if got := stdout.String(); !strings.Contains(got, want) {
			t.Fatalf("stdout = %q, want substring %q", got, want)
		}
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOThemePreviewRejectsInvalidTargetClearly(t *testing.T) {
	registryPath := writeCLIRegistryWithTargets(t, map[string]map[string]string{"bogus": {"mode": "generated"}})
	env := writeThemeCommandEnv(t)
	var stdout, stderr bytes.Buffer

	err := runThemeWithEnv([]string{"preview", "neutral", "--registry", registryPath}, &stdout, &stderr, env)

	assertUsageError(t, err, `invalid target "bogus"`)
	if got := stdout.String(); got != "" {
		t.Fatalf("stdout = %q, want empty", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOSessionStartContainersPrintsDockerPlan(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"session", "start-containers", "--print", "--engine", "docker", "arch", "windows"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(session start-containers --print) error = %v", err)
	}
	if got, want := stdout.String(), "docker start arch windows\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOSessionStartDiscordPrintsFlatpakPlan(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"session", "start-discord", "--print", "--flatpak"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(session start-discord --print) error = %v", err)
	}
	if got, want := stdout.String(), "flatpak run com.discordapp.Discord --start-minimized\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWaybarWatchPrintsWatcherPlan(t *testing.T) {
	stateHome := t.TempDir()
	t.Setenv("XDG_STATE_HOME", stateHome)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"waybar", "watch", "--print", "/tmp/waybar-hypr"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(waybar watch --print) error = %v", err)
	}
	wantParts := []string{"log=" + filepath.Join(stateHome, "waybar", "waybar-hypr.log") + "\n", "waybar -c /tmp/waybar-hypr/config -s /tmp/waybar-hypr/style.css\n"}
	for _, want := range wantParts {
		if got := stdout.String(); !strings.Contains(got, want) {
			t.Fatalf("stdout = %q, want substring %q", got, want)
		}
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWaybarDateUsesRequestedFormat(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"waybar", "date", "--format", "day-month-es", "--time", "2026-05-22T23:54:00Z"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(waybar date) error = %v", err)
	}
	if got, want := stdout.String(), "Viernes - Mayo\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWaybarSwapUsageReadsMeminfoOverride(t *testing.T) {
	meminfo := filepath.Join(t.TempDir(), "meminfo")
	writeFileAt(t, meminfo, "SwapTotal:       2048 kB\nSwapFree:        1024 kB\n")
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"waybar", "swap-usage", "--meminfo", meminfo}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(waybar swap-usage) error = %v", err)
	}
	if got, want := stdout.String(), "󰓡 SWAP 50%\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOSessionImportEnvPrintsCompatibilityCommands(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"session", "import-env", "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(session import-env --print) error = %v", err)
	}
	got := stdout.String()
	if !strings.Contains(got, "systemctl --user import-environment WAYLAND_DISPLAY") || !strings.Contains(got, "dbus-update-activation-environment --systemd WAYLAND_DISPLAY") {
		t.Fatalf("stdout = %q, want import commands", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIODockStartPrintArgsMatchesCompatibilityWrapper(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("HOME", home)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"dock", "start", "--print-args"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(dock start --print-args) error = %v", err)
	}
	want := "nwg-dock-hyprland -r -p right -a center -i 56 -x -mr 8 -mt 0 -mb 0 -lp start -ico " + filepath.Join(home, ".local/share/icons/nixos.svg") + " -c " + filepath.Join(home, ".local/bin/hypr-main-menu") + "\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIODockStartAcceptsCompatibilityReloadArgument(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"dock", "start", "reload", "--print-args"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(dock start reload --print-args) error = %v", err)
	}
	if got := stdout.String(); !strings.Contains(got, "nwg-dock-hyprland -r -p right") {
		t.Fatalf("stdout = %q, want dock command", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWaybarWorkspaceStatusPrintsJSON(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"waybar", "workspace", "status", "2", "--active", "2", "--windows", "3"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(waybar workspace status) error = %v", err)
	}
	want := `{"text":"2","tooltip":"Workspace 2 · 3 window(s)","class":["workspace","active"]}` + "\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWaybarWorkspaceStatusReadsHyprctlJSONFiles(t *testing.T) {
	root := t.TempDir()
	monitors := filepath.Join(root, "monitors.json")
	workspaces := filepath.Join(root, "workspaces.json")
	writeFileAt(t, monitors, `[{"focused":true,"activeWorkspace":{"id":4}}]`)
	writeFileAt(t, workspaces, `[{"id":4,"windows":2},{"id":5,"windows":0}]`)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"waybar", "workspace", "status", "4", "--monitors", monitors, "--workspaces", workspaces}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(waybar workspace status files) error = %v", err)
	}
	want := `{"text":"4","tooltip":"Workspace 4 · 2 window(s)","class":["workspace","active"]}` + "\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWaybarWorkspaceClickPrintsDispatchCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"waybar", "workspace", "click", "7", "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(waybar workspace click --print) error = %v", err)
	}
	want := "hyprctl dispatch hl.dsp.focus({ workspace = 7 })\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWindowsListReadsHyprctlJSONFile(t *testing.T) {
	clients := filepath.Join(t.TempDir(), "clients.json")
	writeFileAt(t, clients, `[{"address":"0xabc","workspace":{"name":"2"},"class":"kitty","title":"term"}]`)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"windows", "list", "--clients", clients}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(windows list) error = %v", err)
	}
	if got, want := stdout.String(), "0xabc\t[2] kitty — term\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWindowsFocusPrintsDispatchCommand(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"windows", "focus", "0xabc", "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(windows focus --print) error = %v", err)
	}
	want := "hyprctl dispatch hl.dsp.focus({ window = \"address:0xabc\" })\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWindowsSwitchPrintsFocusForSelectedLabel(t *testing.T) {
	clients := filepath.Join(t.TempDir(), "clients.json")
	writeFileAt(t, clients, `[{"address":"0xabc","workspace":{"name":"2"},"class":"kitty","title":"term"}]`)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"windows", "switch", "--clients", clients, "--select", "[2] kitty — term", "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(windows switch --print) error = %v", err)
	}
	want := "hyprctl dispatch hl.dsp.focus({ window = \"address:0xabc\" })\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWindowsKillMenuPrintsSelectedPID(t *testing.T) {
	clients := filepath.Join(t.TempDir(), "clients.json")
	writeFileAt(t, clients, `[{"pid":101,"class":"kitty","title":"term","workspace":{"name":"1"}}]`)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"windows", "kill-menu", "--clients", clients, "--pid-rss", "101=20480", "--select", "   20.0 MB  PID 101      [1] kitty — term", "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(windows kill-menu --print) error = %v", err)
	}
	if got, want := stdout.String(), "kill -TERM 101\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOZenFocusReadsClientsFile(t *testing.T) {
	clients := filepath.Join(t.TempDir(), "clients.json")
	writeFileAt(t, clients, `[{"address":"0xzen","class":"zen-browser","focusHistoryID":3}]`)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"zen", "focus", "--clients", clients, "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(zen focus --print) error = %v", err)
	}
	want := "hyprctl dispatch hl.dsp.focus({ window = \"address:0xzen\" })\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOZenOpenNewWindowPrintsInstallPlan(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"zen", "open-new-window", "--print", "--zen-browser", "--already-running"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(zen open-new-window --print) error = %v", err)
	}
	want := "zen-browser --new-tab about:blank\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWallpaperCurrentCreatesCompatibilitySymlink(t *testing.T) {
	root := t.TempDir()
	home := filepath.Join(root, "home")
	runtimeDir := filepath.Join(root, "runtime")
	fallback := filepath.Join(home, ".config", "wallpapers", "xnm1-background.png")
	current := filepath.Join(root, "wallpaper.png")
	writeFileAt(t, fallback, "fallback")
	writeFileAt(t, current, "current")
	writeFileAt(t, filepath.Join(runtimeDir, "hypr-random-wallpaper.current"), current+"\n")
	t.Setenv("HOME", home)
	t.Setenv("XDG_RUNTIME_DIR", runtimeDir)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"wallpaper", "current"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(wallpaper current) error = %v", err)
	}
	linkPath := filepath.Join(runtimeDir, "hypr-current-wallpaper")
	if got, want := stdout.String(), linkPath+"\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if target, err := os.Readlink(linkPath); err != nil || target != current {
		t.Fatalf("Readlink(%q) = %q, %v; want %q", linkPath, target, err, current)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOMenuPrintsItemsAndSelectedAction(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"menu", "keyboard", "--select", "Latam", "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(menu keyboard --select Latam --print) error = %v", err)
	}
	if got, want := stdout.String(), "hyprctl switchxkblayout all 1\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOMenuPowerRequiresConfirmationForDestructiveLiveAction(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"menu", "power", "--select", "Reboot"}, &stdout, &stderr)

	assertUsageError(t, err, "destructive action requires --confirm reboot or --print")
}

func TestRunWithIOWebappCreateDryRunPrintsPlanWithoutWriting(t *testing.T) {
	dataHome := t.TempDir()
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"webapp", "create", "--dry-run", "--xdg-data-home", dataHome, "--name", "Mi App", "--url", "example.com", "--browser", "chromium"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(webapp create --dry-run) error = %v", err)
	}
	wantParts := []string{"slug=mi-app\n", "url=https://example.com\n", filepath.Join(dataHome, "applications", "mi-app.desktop")}
	for _, want := range wantParts {
		if got := stdout.String(); !strings.Contains(got, want) {
			t.Fatalf("stdout = %q, want substring %q", got, want)
		}
	}
	if _, err := os.Stat(filepath.Join(dataHome, "applications", "mi-app.desktop")); !os.IsNotExist(err) {
		t.Fatalf("desktop file exists after dry-run or stat error = %v, want not exist", err)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOWebappListPrintsDiscoveredApps(t *testing.T) {
	dataHome := t.TempDir()
	writeFileAt(t, filepath.Join(dataHome, "applications", "chat.desktop"), "[Desktop Entry]\nName=Chat\nX-Hypr-WebApp=true\nX-Hypr-WebApp-URL=https://chat.example\nExec=/tmp/launcher\n")
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"webapp", "list", "--xdg-data-home", dataHome}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(webapp list) error = %v", err)
	}
	if got, want := stdout.String(), "Chat\thttps://chat.example\t"+filepath.Join(dataHome, "applications", "chat.desktop")+"\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOSmartRunLivePrintsExecutionPlan(t *testing.T) {
	var stdout, stderr bytes.Buffer
	t.Setenv("BROWSER", "firefox")
	t.Setenv("HOME", "/home/me")

	err := runWithIO([]string{"smart-run", "run", "example.com", "--print-exec"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(smart-run run --print-exec) error = %v", err)
	}
	if got, want := stdout.String(), "firefox https://example.com\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOOSDVolumePrintsPlan(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"osd", "volume", "up", "--print", "--volume", "42", "--muted=false"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(osd volume --print) error = %v", err)
	}
	wantParts := []string{
		"pamixer --allow-boost --set-limit 150 -i 3\n",
		"notify-send -a osd-volume -h string:x-canonical-private-synchronous:osd-volume -h int:value:42 -t 900  Volume 42% \n",
	}
	for _, want := range wantParts {
		if got := stdout.String(); !strings.Contains(got, want) {
			t.Fatalf("stdout = %q, want substring %q", got, want)
		}
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOOSDVolumeLiveRunsActionThenQueriesAndNotifies(t *testing.T) {
	bin := t.TempDir()
	logPath := filepath.Join(t.TempDir(), "osd.log")
	writeExecutable(t, filepath.Join(bin, "pamixer"), "#!/bin/sh\necho pamixer:$* >>\"$ORGM_TEST_LOG\"\ncase \"$*\" in *--get-volume*) echo 37;; *--get-mute*) echo false;; esac\n")
	writeExecutable(t, filepath.Join(bin, "notify-send"), "#!/bin/sh\necho notify:$* >>\"$ORGM_TEST_LOG\"\n")
	t.Setenv("PATH", bin)
	t.Setenv("ORGM_TEST_LOG", logPath)
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"osd", "volume", "up"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(osd volume live) error = %v", err)
	}
	log := readFile(t, logPath)
	wantParts := []string{"pamixer:--allow-boost --set-limit 150 -i 3\n", "pamixer:--get-volume\n", "pamixer:--get-mute\n", "notify:-a osd-volume -h string:x-canonical-private-synchronous:osd-volume -h int:value:37 -t 900  Volume 37%\n"}
	for _, want := range wantParts {
		if !strings.Contains(log, want) {
			t.Fatalf("log = %q, want substring %q", log, want)
		}
	}
	if got := stdout.String(); got != "" {
		t.Fatalf("stdout = %q, want empty", got)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOSmartRunParsePrintsPlan(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"smart-run", "parse", "!g", "hyprland", "lua"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(smart-run parse) error = %v", err)
	}
	want := "kind=browser-url\nurl=https://www.google.com/search?q=hyprland+lua\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOSmartRunRunPrintsDesktopPlan(t *testing.T) {
	var stdout, stderr bytes.Buffer

	err := runWithIO([]string{"smart-run", "run", "ask", "claude", "!c", "--print"}, &stdout, &stderr)

	if err != nil {
		t.Fatalf("runWithIO(smart-run run --print) error = %v", err)
	}
	want := "kind=desktop\ndesktop=Claude.desktop\nquery=ask claude\n"
	if got := stdout.String(); got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestRunWithIOCapturesCurrentWallpaperUsageErrors(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want string
	}{
		{
			name: "unknown subcommand",
			args: []string{"wallpaper", "bogus"},
			want: "usage: orgm-hypr wallpaper [restore|current|pick|carousel static|carousel video|set-static PATH|set-video PATH|status]",
		},
		{
			name: "missing set-static path",
			args: []string{"wallpaper", "set-static"},
			want: "usage: orgm-hypr wallpaper set-static PATH",
		},
		{
			name: "missing clean-thumbs root",
			args: []string{"wallpaper", "clean-thumbs"},
			want: "root path is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer

			err := runWithIO(tt.args, &stdout, &stderr)

			assertUsageError(t, err, tt.want)
			if got := stdout.String(); got != "" {
				t.Fatalf("stdout = %q, want empty", got)
			}
			if got := stderr.String(); got != "" {
				t.Fatalf("stderr = %q, want empty", got)
			}
		})
	}
}

func writeCLIRegistry(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "themes.json")
	writeCLIRegistryAt(t, path)
	return path
}

func writeCLIRegistryWithTargets(t *testing.T, targets map[string]map[string]string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "themes.json")
	targetData, err := json.Marshal(targets)
	if err != nil {
		t.Fatalf("Marshal(targets) error = %v", err)
	}
	content := `{
		"schemaVersion": 1,
		"activeDefault": "neutral",
		"themes": [{
			"id": "neutral",
			"name": "Neutral",
			"defaultMode": "dark",
			"wallpaper": {"mode": "current", "deriveColors": false},
			"palettes": {
				"dark": {"background": "#131317", "surface": "#201f23", "surfaceAlt": "#353438", "foreground": "#e5e1e7", "muted": "#918f9a", "accent": "#c2c1ff", "accent2": "#f5b2e0", "border": "#47464f", "urgent": "#ffb4ab", "success": "#b5ccba"},
				"light": {"background": "#fffbff", "surface": "#f4eff4", "surfaceAlt": "#e7e0e7", "foreground": "#1c1b1f", "muted": "#767680", "accent": "#595992", "accent2": "#8a4f7b", "border": "#c8c5d1", "urgent": "#ba1a1a", "success": "#386a20"}
			},
			"targets": ` + string(targetData) + `
		}]
	}`
	writeFileAt(t, path, content)
	return path
}

func writeCLIRegistryAt(t *testing.T, path string) {
	t.Helper()
	content := `{
		"schemaVersion": 1,
		"activeDefault": "neutral",
		"themes": [{
			"id": "neutral",
			"name": "Neutral",
			"defaultMode": "dark",
			"wallpaper": {"mode": "current", "deriveColors": false},
			"palettes": {
				"dark": {"background": "#131317", "surface": "#201f23", "surfaceAlt": "#353438", "foreground": "#e5e1e7", "muted": "#918f9a", "accent": "#c2c1ff", "accent2": "#f5b2e0", "border": "#47464f", "urgent": "#ffb4ab", "success": "#b5ccba"},
				"light": {"background": "#fffbff", "surface": "#f4eff4", "surfaceAlt": "#e7e0e7", "foreground": "#1c1b1f", "muted": "#767680", "accent": "#595992", "accent2": "#8a4f7b", "border": "#c8c5d1", "urgent": "#ba1a1a", "success": "#386a20"}
			},
			"targets": {"chromium": {"mode": "export"}, "zen": {"mode": "export"}}
		}]
	}`
	writeFileAt(t, path, content)
}

func writeFileAt(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func writeExecutable(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o700); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	return string(data)
}

func writeThemeCommandEnv(t *testing.T) themeCommandEnv {
	t.Helper()
	root := t.TempDir()
	return themeCommandEnv{
		RegistryPath: filepath.Join(root, "config", "orgm-hypr", "themes.json"),
		StateHome:    filepath.Join(root, "state"),
		CacheHome:    filepath.Join(root, "cache"),
		ConfigHome:   filepath.Join(root, "config"),
	}
}

func assertUsageError(t *testing.T, err error, want string) {
	t.Helper()
	if err == nil {
		t.Fatalf("error = nil, want usage error %q", want)
	}
	var exitErr *cli.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("error type = %T, want *cli.ExitError", err)
	}
	if exitErr.Code != 2 {
		t.Fatalf("exit code = %d, want 2", exitErr.Code)
	}
	if got := err.Error(); !strings.Contains(got, want) {
		t.Fatalf("error = %q, want substring %q", got, want)
	}
}
