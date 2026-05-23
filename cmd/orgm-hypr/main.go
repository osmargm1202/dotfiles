package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/osmarg/dotfiles/orgm-hypr/internal/cli"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/dock"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/menu"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/osd"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/session"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/smartrun"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/theme"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/wallpaper"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/waybar"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/webapp"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/windows"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/zen"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		os.Exit(cli.PrintError(os.Stderr, err))
	}
}

func run(args []string) error {
	return runWithIO(args, os.Stdout, os.Stderr)
}

func runWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError(usage())
	}

	switch args[0] {
	case "version":
		fmt.Fprintln(stdout, "orgm-hypr dev")
		return nil
	case "wallpaper":
		return runWallpaperWithIO(args[1:], stdout, stderr)
	case "theme":
		return runThemeWithIO(args[1:], stdout, stderr)
	case "session":
		return runSessionWithIO(args[1:], stdout, stderr)
	case "waybar":
		return runWaybarWithIO(args[1:], stdout, stderr)
	case "dock":
		return runDockWithIO(args[1:], stdout, stderr)
	case "windows":
		return runWindowsWithIO(args[1:], stdout, stderr)
	case "zen":
		return runZenWithIO(args[1:], stdout, stderr)
	case "osd":
		return runOSDWithIO(args[1:], stdout, stderr)
	case "smart-run":
		return runSmartRunWithIO(args[1:], stdout, stderr)
	case "menu":
		return runMenuWithIO(args[1:], stdout, stderr)
	case "webapp":
		return runWebappWithIO(args[1:], stdout, stderr)
	case "updates", "notify":
		return cli.UsageError("%s: command group not implemented yet", args[0])
	default:
		return cli.UsageError(usage())
	}
}

func runThemeWithIO(args []string, stdout, stderr io.Writer) error {
	return runThemeWithEnv(args, stdout, stderr, defaultThemeCommandEnv())
}

func runThemeWithEnv(args []string, stdout, stderr io.Writer, env themeCommandEnv) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr theme [list|validate|status|preview|apply]")
	}
	opts, err := parseThemeFlags(args[1:], env.RegistryPath)
	if err != nil {
		return cli.UsageError(err.Error())
	}

	registry, err := theme.LoadRegistry(opts.registryPath)
	if err != nil {
		return err
	}

	switch args[0] {
	case "list":
		if len(opts.positionals) != 0 || opts.dryRun || opts.mode != "" {
			return cli.UsageError("usage: orgm-hypr theme list [--registry PATH]")
		}
		for _, summary := range theme.Summaries(registry) {
			fmt.Fprintf(stdout, "%s\t%s\t%s\n", summary.ID, summary.Name, strings.Join(summary.Modes, ","))
		}
		return nil
	case "validate":
		if len(opts.positionals) != 0 || opts.dryRun || opts.mode != "" {
			return cli.UsageError("usage: orgm-hypr theme validate [--registry PATH]")
		}
		fmt.Fprintf(stdout, "valid: %d theme(s)\n", len(registry.Themes))
		return nil
	case "status":
		if len(opts.positionals) != 0 || opts.dryRun || opts.mode != "" {
			return cli.UsageError("usage: orgm-hypr theme status [--registry PATH]")
		}
		active, ok := theme.ActiveTheme(registry)
		if !ok {
			return cli.UsageError("active theme %q not found", registry.ActiveDefault)
		}
		wallpaperMode := active.Wallpaper.Mode
		if wallpaperMode == "" {
			wallpaperMode = "none"
		}
		fmt.Fprintf(stdout, "active=%s\nmode=%s\nwallpaper=%s\nlastApply=none\n", active.ID, active.DefaultMode, wallpaperMode)
		return nil
	case "preview", "apply":
		if len(opts.positionals) != 1 {
			return cli.UsageError("usage: orgm-hypr theme %s THEME [--mode dark|light|auto] [--dry-run] [--registry PATH]", args[0])
		}
		if args[0] == "preview" && opts.dryRun {
			return cli.UsageError("preview does not accept --dry-run")
		}
		selected, ok := findTheme(registry, opts.positionals[0])
		if !ok {
			return cli.UsageError("theme %q not found", opts.positionals[0])
		}
		plan, err := theme.BuildApplyPlan(selected, theme.PlanOptions{Mode: opts.mode, StateHome: env.StateHome, CacheHome: env.CacheHome, ConfigHome: env.ConfigHome})
		if err != nil {
			return cli.UsageError(err.Error())
		}
		dryRun := args[0] == "preview" || opts.dryRun
		printThemePlan(stdout, plan, dryRun)
		if args[0] == "apply" && !opts.dryRun {
			writer := theme.AtomicWriter{Marker: theme.GeneratedMarker}
			for _, write := range plan.Writes {
				if err := writer.Write(write.Path, write.Content, write.Mode); err != nil {
					return err
				}
			}
		}
		return nil
	default:
		return cli.UsageError("usage: orgm-hypr theme [list|validate|status|preview|apply]")
	}
}

type themeCommandEnv struct {
	RegistryPath string
	StateHome    string
	CacheHome    string
	ConfigHome   string
}

type themeFlagOptions struct {
	registryPath string
	mode         string
	dryRun       bool
	positionals  []string
}

func defaultThemeCommandEnv() themeCommandEnv {
	return themeCommandEnv{
		RegistryPath: defaultThemeRegistryPath(),
		StateHome:    defaultXDGPath("XDG_STATE_HOME", ".local/state"),
		CacheHome:    defaultXDGPath("XDG_CACHE_HOME", ".cache"),
		ConfigHome:   defaultXDGPath("XDG_CONFIG_HOME", ".config"),
	}
}

func defaultThemeRegistryPath() string {
	if configHome := os.Getenv("XDG_CONFIG_HOME"); configHome != "" {
		return filepath.Join(configHome, "orgm-hypr", "themes.json")
	}
	return filepath.Join(os.Getenv("HOME"), ".config", "orgm-hypr", "themes.json")
}

func defaultXDGPath(envName, homeRelative string) string {
	if value := os.Getenv(envName); value != "" {
		return value
	}
	return filepath.Join(os.Getenv("HOME"), homeRelative)
}

func parseThemeFlags(args []string, defaultRegistryPath string) (themeFlagOptions, error) {
	opts := themeFlagOptions{registryPath: defaultRegistryPath}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		switch arg {
		case "--registry":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("--registry requires a value")
			}
			i++
			opts.registryPath = args[i]
		case "--mode":
			if i+1 >= len(args) {
				return opts, fmt.Errorf("--mode requires a value")
			}
			i++
			opts.mode = args[i]
		case "--dry-run":
			opts.dryRun = true
		default:
			if strings.HasPrefix(arg, "--") {
				return opts, fmt.Errorf("unknown flag: %s", arg)
			}
			opts.positionals = append(opts.positionals, arg)
		}
	}
	return opts, nil
}

func findTheme(registry theme.Registry, id string) (theme.Theme, bool) {
	for _, item := range registry.Themes {
		if item.ID == id {
			return item, true
		}
	}
	return theme.Theme{}, false
}

func printThemePlan(stdout io.Writer, plan theme.ApplyPlan, dryRun bool) {
	fmt.Fprintf(stdout, "theme=%s\nmode=%s\ndryRun=%t\n", plan.ThemeID, plan.Mode, dryRun)
	fmt.Fprintln(stdout, "Writes:")
	if len(plan.Writes) == 0 {
		fmt.Fprintln(stdout, "  (none)")
	}
	for _, write := range plan.Writes {
		fmt.Fprintf(stdout, "  %s\n", write.Path)
	}
	fmt.Fprintln(stdout, "Reloads:")
	if len(plan.Reloads) == 0 {
		fmt.Fprintln(stdout, "  (none)")
	}
	for _, reload := range plan.Reloads {
		fmt.Fprintf(stdout, "  %s: %s\n", reload.Target, reload.Command)
	}
	fmt.Fprintln(stdout, "Warnings:")
	if len(plan.Warnings) == 0 {
		fmt.Fprintln(stdout, "  (none)")
	}
	for _, warning := range plan.Warnings {
		fmt.Fprintf(stdout, "  %s\n", warning)
	}
}

func runSessionWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr session [import-env|start-containers|start-discord]")
	}
	switch args[0] {
	case "import-env":
		flags := flag.NewFlagSet("orgm-hypr session import-env", flag.ContinueOnError)
		flags.SetOutput(stderr)
		printOnly := flags.Bool("print", false, "print commands without running them")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		commands := session.ImportEnvCommands()
		if *printOnly {
			for _, command := range commands {
				fmt.Fprintln(stdout, shellCommand(command.Name, command.Args))
			}
			return nil
		}
		for _, command := range commands {
			cmd := exec.Command(command.Name, command.Args...)
			cmd.Stdout = stdout
			cmd.Stderr = stderr
			if err := cmd.Run(); err != nil {
				return err
			}
		}
		return nil
	case "start-containers":
		flags := flag.NewFlagSet("orgm-hypr session start-containers", flag.ContinueOnError)
		flags.SetOutput(stderr)
		printOnly := flags.Bool("print", false, "print command without running it")
		engine := flags.String("engine", "auto", "auto, docker, or podman")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		names := flags.Args()
		if len(names) == 0 {
			names = []string{"arch", "windows"}
		}
		command, ok := session.ContainerStartCommand(names, func(name string) bool {
			if *engine == "auto" {
				return commandExists(name)
			}
			return name == *engine
		})
		if !ok {
			return fmt.Errorf("no supported container engine found")
		}
		if *printOnly {
			fmt.Fprintln(stdout, shellCommand(command.Name, command.Args))
			return nil
		}
		return runCommand(command.Name, command.Args, stdout, stderr, false)
	case "start-discord":
		flags := flag.NewFlagSet("orgm-hypr session start-discord", flag.ContinueOnError)
		flags.SetOutput(stderr)
		printOnly := flags.Bool("print", false, "print command without running it")
		flatpakOnly := flags.Bool("flatpak", false, "force flatpak plan for tests")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		command, ok := session.DiscordCommand(func(name string) bool {
			if *flatpakOnly {
				return name == "flatpak"
			}
			return commandExists(name)
		}, func(appID string) bool {
			if *flatpakOnly {
				return appID == "com.discordapp.Discord"
			}
			return flatpakAppExists(appID)
		})
		if !ok {
			return nil
		}
		if *printOnly {
			fmt.Fprintln(stdout, shellCommand(command.Name, command.Args))
			return nil
		}
		return runCommand(command.Name, command.Args, stdout, stderr, true)
	default:
		return cli.UsageError("usage: orgm-hypr session [import-env|start-containers|start-discord]")
	}
}

func runWaybarWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr waybar [date|swap-usage|watch|watch-plan|workspace]")
	}
	switch args[0] {
	case "date":
		flags := flag.NewFlagSet("orgm-hypr waybar date", flag.ContinueOnError)
		flags.SetOutput(stderr)
		format := flags.String("format", "date-es", "date-es, day-month-es, or time-ampm")
		timeValue := flags.String("time", "", "RFC3339 time override for tests")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		now := time.Now()
		if *timeValue != "" {
			parsed, err := time.Parse(time.RFC3339, *timeValue)
			if err != nil {
				return cli.UsageError("invalid --time: %v", err)
			}
			now = parsed
		}
		text, err := waybar.FormatDate(now, *format)
		if err != nil {
			return cli.UsageError(err.Error())
		}
		fmt.Fprintln(stdout, text)
		return nil
	case "swap-usage":
		flags := flag.NewFlagSet("orgm-hypr waybar swap-usage", flag.ContinueOnError)
		flags.SetOutput(stderr)
		meminfo := flags.String("meminfo", "/proc/meminfo", "meminfo path")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		file, err := os.Open(*meminfo)
		if err != nil {
			return err
		}
		defer file.Close()
		text, err := waybar.SwapUsageFromMeminfo(file)
		if err != nil {
			return err
		}
		fmt.Fprintln(stdout, text)
		return nil
	case "watch-plan":
		if len(args) != 2 {
			return cli.UsageError("usage: orgm-hypr waybar watch-plan CONFIG_DIR")
		}
		plan := waybar.WatchPlan(args[1], defaultXDGPath("XDG_STATE_HOME", ".local/state"))
		fmt.Fprintf(stdout, "log=%s\nwaybar=%s\n", plan.LogPath, shellCommand("waybar", plan.WaybarArgs))
		return nil
	case "watch":
		return runWaybarWatchWithIO(args[1:], stdout, stderr)
	case "workspace":
		return runWaybarWorkspaceWithIO(args[1:], stdout, stderr)
	default:
		return cli.UsageError("usage: orgm-hypr waybar [date|swap-usage|watch|watch-plan|workspace]")
	}
}

func runWaybarWatchWithIO(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("orgm-hypr waybar watch", flag.ContinueOnError)
	flags.SetOutput(stderr)
	printOnly := flags.Bool("print", false, "print watcher plan without running")
	if err := flags.Parse(args); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() > 1 {
		return cli.UsageError("usage: orgm-hypr waybar watch [CONFIG_DIR] [--print]")
	}
	configDir := defaultXDGPath("WAYBAR_CONFIG_DIR", ".config/waybar")
	if flags.NArg() == 1 {
		configDir = flags.Arg(0)
	}
	plan := waybar.WatchPlan(configDir, defaultXDGPath("XDG_STATE_HOME", ".local/state"))
	if *printOnly {
		fmt.Fprintf(stdout, "log=%s\nwaybar=%s\n", plan.LogPath, shellCommand("waybar", plan.WaybarArgs))
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(plan.LogPath), 0o700); err != nil {
		return err
	}
	for {
		_ = exec.Command("pkill", "-KILL", "-f", `(^|/)waybar($| )|[.]waybar-wrapped`).Run()
		logFile, err := os.OpenFile(plan.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			return err
		}
		cmd := exec.Command("waybar", plan.WaybarArgs...)
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		_ = cmd.Run()
		_ = logFile.Close()
		time.Sleep(2 * time.Second)
	}
}

func runWaybarWorkspaceWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 2 {
		return cli.UsageError("usage: orgm-hypr waybar workspace [status|click] WORKSPACE_ID")
	}
	workspaceID, err := strconv.Atoi(args[1])
	if err != nil || workspaceID <= 0 {
		return cli.UsageError("workspace ID must be a positive integer")
	}
	switch args[0] {
	case "status":
		flags := flag.NewFlagSet("orgm-hypr waybar workspace status", flag.ContinueOnError)
		flags.SetOutput(stderr)
		active := flags.Int("active", 0, "active workspace id")
		windowsCount := flags.Int("windows", -1, "window count")
		monitorsPath := flags.String("monitors", "", "hyprctl monitors JSON file for tests")
		workspacesPath := flags.String("workspaces", "", "hyprctl workspaces JSON file for tests")
		if err := flags.Parse(args[2:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		activeID := *active
		if activeID == 0 {
			activeID, err = activeWorkspaceID(*monitorsPath)
			if err != nil {
				return err
			}
		}
		count := *windowsCount
		if count < 0 {
			count, err = workspaceWindowCount(workspaceID, *workspacesPath)
			if err != nil {
				return err
			}
		}
		text, err := waybar.WorkspaceStatusJSON(workspaceID, activeID, count)
		if err != nil {
			return err
		}
		fmt.Fprint(stdout, text)
		return nil
	case "click":
		flags := flag.NewFlagSet("orgm-hypr waybar workspace click", flag.ContinueOnError)
		flags.SetOutput(stderr)
		printOnly := flags.Bool("print", false, "print command without running it")
		if err := flags.Parse(args[2:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		command := []string{"dispatch", fmt.Sprintf("hl.dsp.focus({ workspace = %d })", workspaceID)}
		if *printOnly {
			fmt.Fprintln(stdout, shellCommand("hyprctl", command))
			return nil
		}
		cmd := exec.Command("hyprctl", command...)
		cmd.Stdout = stdout
		cmd.Stderr = stderr
		return cmd.Run()
	default:
		return cli.UsageError("usage: orgm-hypr waybar workspace [status|click] WORKSPACE_ID")
	}
}

func runDockWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr dock start [--reload] [--print-args]")
	}
	if args[0] != "start" {
		return cli.UsageError("usage: orgm-hypr dock start [--reload] [--print-args]")
	}
	flags := flag.NewFlagSet("orgm-hypr dock start", flag.ContinueOnError)
	flags.SetOutput(stderr)
	printArgs := flags.Bool("print-args", false, "print compatibility command without starting")
	reload := flags.Bool("reload", false, "restart existing dock before start")
	flagArgs, reloadAlias := normalizeDockArgs(args[1:])
	if err := flags.Parse(flagArgs); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() > 1 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(1))
	}
	if flags.NArg() == 1 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(0))
	}
	reloadValue := *reload || reloadAlias
	env := dock.Env{
		Home:             os.Getenv("HOME"),
		IconSize:         os.Getenv("HYPR_NWG_DOCK_ICON_SIZE"),
		MarginRight:      os.Getenv("HYPR_NWG_DOCK_MARGIN_RIGHT"),
		MarginTop:        os.Getenv("HYPR_NWG_DOCK_MARGIN_TOP"),
		MarginBottom:     os.Getenv("HYPR_NWG_DOCK_MARGIN_BOTTOM"),
		LauncherPosition: os.Getenv("HYPR_NWG_DOCK_LAUNCHER_POSITION"),
		LauncherIcon:     os.Getenv("HYPR_NWG_DOCK_LAUNCHER_ICON"),
		LauncherCommand:  os.Getenv("HYPR_NWG_DOCK_LAUNCHER_COMMAND"),
	}
	argsForDock := dock.StartArgs(env)
	if *printArgs {
		fmt.Fprintln(stdout, shellCommand("nwg-dock-hyprland", argsForDock))
		return nil
	}
	if _, err := exec.LookPath("nwg-dock-hyprland"); err != nil {
		notify := exec.Command("notify-send", "Hyprland dock", "nwg-dock-hyprland is not installed yet")
		_ = notify.Run()
		return fmt.Errorf("nwg-dock-hyprland is not installed yet")
	}
	if reloadValue {
		_ = exec.Command("pkill", "-f", "^nwg-dock-hyprland( |$)").Run()
		time.Sleep(200 * time.Millisecond)
	}
	cmd := exec.Command("nwg-dock-hyprland", argsForDock...)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	return cmd.Start()
}

func activeWorkspaceID(path string) (int, error) {
	data, err := readHyprJSON(path, "monitors")
	if err != nil {
		return 0, err
	}
	var monitors []struct {
		Focused         bool `json:"focused"`
		ActiveWorkspace struct {
			ID int `json:"id"`
		} `json:"activeWorkspace"`
	}
	if err := json.Unmarshal(data, &monitors); err != nil {
		return 0, err
	}
	for _, monitor := range monitors {
		if monitor.Focused {
			return monitor.ActiveWorkspace.ID, nil
		}
	}
	if len(monitors) > 0 {
		return monitors[0].ActiveWorkspace.ID, nil
	}
	return 0, nil
}

func workspaceWindowCount(workspaceID int, path string) (int, error) {
	data, err := readHyprJSON(path, "workspaces")
	if err != nil {
		return 0, err
	}
	var workspaces []struct {
		ID      int `json:"id"`
		Windows int `json:"windows"`
	}
	if err := json.Unmarshal(data, &workspaces); err != nil {
		return 0, err
	}
	for _, workspace := range workspaces {
		if workspace.ID == workspaceID {
			return workspace.Windows, nil
		}
	}
	return 0, nil
}

func readHyprJSON(path, what string) ([]byte, error) {
	if path != "" {
		return os.ReadFile(path)
	}
	return exec.Command("hyprctl", "-j", what).Output()
}

func normalizeDockArgs(args []string) ([]string, bool) {
	out := make([]string, 0, len(args))
	reloadAlias := false
	for _, arg := range args {
		if arg == "reload" || arg == "restart" {
			reloadAlias = true
			continue
		}
		out = append(out, arg)
	}
	return out, reloadAlias
}

func runWindowsWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr windows [list|focus|switch|kill-menu]")
	}
	switch args[0] {
	case "list":
		flags := flag.NewFlagSet("orgm-hypr windows list", flag.ContinueOnError)
		flags.SetOutput(stderr)
		clientsPath := flags.String("clients", "", "hyprctl clients JSON file for tests")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		data, err := readHyprClientsJSON(*clientsPath)
		if err != nil {
			return err
		}
		rows, err := windows.ClientRowsFromJSON(data)
		if err != nil {
			return err
		}
		for _, row := range rows {
			fmt.Fprintf(stdout, "%s\t%s\n", row.Address, row.Label)
		}
		return nil
	case "focus":
		address, printOnly, err := parseFocusArgs(args[1:])
		if err != nil {
			return cli.UsageError(err.Error())
		}
		command, ok := windows.FocusCommand(address)
		if !ok {
			return cli.UsageError("usage: orgm-hypr windows focus ADDRESS [--print]")
		}
		return runOrPrintCommand(command, printOnly, stdout, stderr)
	case "switch":
		return runWindowsSwitchWithIO(args[1:], stdout, stderr)
	case "kill-menu":
		return runWindowsKillMenuWithIO(args[1:], stdout, stderr)
	default:
		return cli.UsageError("usage: orgm-hypr windows [list|focus|switch|kill-menu]")
	}
}

func runWindowsSwitchWithIO(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("orgm-hypr windows switch", flag.ContinueOnError)
	flags.SetOutput(stderr)
	clientsPath := flags.String("clients", "", "hyprctl clients JSON file for tests")
	selectValue := flags.String("select", "", "selected label for tests")
	launcher := flags.String("launcher", "fuzzel", "fuzzel, walker, or rofi")
	printOnly := flags.Bool("print", false, "print focus command without running it")
	if err := flags.Parse(args); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() != 0 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(0))
	}
	data, err := readHyprClientsJSON(*clientsPath)
	if err != nil {
		return err
	}
	rows, err := windows.ClientRowsFromJSON(data)
	if err != nil {
		return err
	}
	labels := make([]string, 0, len(rows))
	byLabel := map[string]string{}
	for _, row := range rows {
		labels = append(labels, row.Label)
		byLabel[row.Label] = row.Address
	}
	selection := *selectValue
	if selection == "" {
		if len(labels) == 0 {
			return nil
		}
		selection, err = dmenuPick(*launcher, "Window> ", labels, stderr)
		if err != nil || selection == "" {
			return err
		}
	}
	command, ok := windows.FocusCommand(byLabel[selection])
	if !ok {
		return fmt.Errorf("selected window not found")
	}
	return runOrPrintCommand(command, *printOnly, stdout, stderr)
}

func runWindowsKillMenuWithIO(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("orgm-hypr windows kill-menu", flag.ContinueOnError)
	flags.SetOutput(stderr)
	clientsPath := flags.String("clients", "", "hyprctl clients JSON file for tests")
	selectValue := flags.String("select", "", "selected label for tests")
	pidRSS := flags.String("pid-rss", "", "test RSS map, e.g. 101=20480")
	minRSS := flags.Int("min-rss-kb", 10240, "minimum RSS in KB")
	printOnly := flags.Bool("print", false, "print kill command without running it")
	if err := flags.Parse(args); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() != 0 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(0))
	}
	data, err := readHyprClientsJSON(*clientsPath)
	if err != nil {
		return err
	}
	rssMap := parsePIDRSS(*pidRSS)
	candidates, err := windows.KillCandidatesFromJSON(data, *minRSS, func(pid int) (int, bool) {
		if rss, ok := rssMap[pid]; ok {
			return rss, true
		}
		return procRSSOwned(pid)
	})
	if err != nil {
		return err
	}
	if len(candidates) == 0 {
		fmt.Fprintln(stderr, "No Hyprland window process over 10 MB.")
		return nil
	}
	labels := make([]string, 0, len(candidates))
	byLabel := map[string]int{}
	for _, candidate := range candidates {
		labels = append(labels, candidate.Label)
		byLabel[candidate.Label] = candidate.PID
	}
	selection := *selectValue
	if selection == "" {
		selection, err = dmenuPick("fuzzel", "Kill window> ", labels, stderr)
		if err != nil || selection == "" {
			return err
		}
	}
	pid := byLabel[selection]
	if pid <= 0 {
		return fmt.Errorf("selected process not found")
	}
	if *printOnly {
		fmt.Fprintf(stdout, "kill -TERM %d\n", pid)
		return nil
	}
	return exec.Command("kill", "-TERM", strconv.Itoa(pid)).Run()
}

func runZenWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr zen [focus|open-new-window]")
	}
	switch args[0] {
	case "focus":
		flags := flag.NewFlagSet("orgm-hypr zen focus", flag.ContinueOnError)
		flags.SetOutput(stderr)
		clientsPath := flags.String("clients", "", "hyprctl clients JSON file for tests")
		printOnly := flags.Bool("print", false, "print command without running it")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		data, err := readHyprClientsJSON(*clientsPath)
		if err != nil {
			return err
		}
		address, ok, err := zen.FocusAddressFromClients(data)
		if err != nil {
			return err
		}
		if !ok {
			return nil
		}
		command, _ := windows.FocusCommand(address)
		if *printOnly {
			fmt.Fprintln(stdout, shellCommand(command.Name, command.Args))
			return nil
		}
		cmd := exec.Command(command.Name, command.Args...)
		cmd.Stdout = stdout
		cmd.Stderr = stderr
		return cmd.Run()
	case "open-new-window":
		return runZenOpenNewWindowWithIO(args[1:], stdout, stderr)
	default:
		return cli.UsageError("usage: orgm-hypr zen [focus|open-new-window]")
	}
}

func runZenOpenNewWindowWithIO(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("orgm-hypr zen open-new-window", flag.ContinueOnError)
	flags.SetOutput(stderr)
	printOnly := flags.Bool("print", false, "print command without running it")
	alreadyRunning := flags.Bool("already-running", false, "force already-running state for tests")
	flatpakFound := flags.Bool("flatpak", false, "force flatpak binary presence for tests")
	flatpakZen := flags.Bool("flatpak-zen", false, "force Zen flatpak app presence for tests")
	zenBrowser := flags.Bool("zen-browser", false, "force zen-browser presence for tests")
	zenBinary := flags.Bool("zen", false, "force zen binary presence for tests")
	if err := flags.Parse(args); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() != 0 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(0))
	}
	state := zen.InstallState{Flatpak: *flatpakFound, FlatpakZen: *flatpakZen, ZenBrowser: *zenBrowser, Zen: *zenBinary}
	if !*printOnly {
		state = zen.InstallState{Flatpak: commandExists("flatpak"), FlatpakZen: flatpakAppExists("app.zen_browser.zen"), ZenBrowser: commandExists("zen-browser"), Zen: commandExists("zen")}
		*alreadyRunning = zenAlreadyRunning()
	}
	command, ok := zen.OpenCommand(state, *alreadyRunning)
	if !ok {
		if *printOnly {
			return cli.UsageError("Zen Browser is not installed")
		}
		_ = exec.Command("notify-send", "Zen Browser", "Zen Browser is not installed").Run()
		return fmt.Errorf("Zen Browser is not installed")
	}
	if *printOnly {
		fmt.Fprintln(stdout, shellCommand(command.Name, command.Args))
		return nil
	}
	cmd := exec.Command(command.Name, command.Args...)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	return runZenWithIO([]string{"focus"}, stdout, stderr)
}

func flatpakAppExists(appID string) bool {
	return exec.Command("flatpak", "info", appID).Run() == nil
}

func zenAlreadyRunning() bool {
	data, err := readHyprClientsJSON("")
	if err != nil {
		return false
	}
	_, ok, err := zen.FocusAddressFromClients(data)
	return err == nil && ok
}

func runOSDWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 2 {
		return cli.UsageError("usage: orgm-hypr osd [volume|mic|brightness] ACTION")
	}
	flags := flag.NewFlagSet("orgm-hypr osd", flag.ContinueOnError)
	flags.SetOutput(stderr)
	printOnly := flags.Bool("print", false, "print command and notify payload without running")
	volume := flags.Int("volume", 0, "current volume/brightness value for tests")
	muted := flags.Bool("muted", false, "current mute state for tests")
	if err := flags.Parse(args[2:]); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() != 0 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(0))
	}
	var plan osd.Plan
	var err error
	switch args[0] {
	case "volume":
		plan, err = osd.PlanVolume(args[1], osd.DeviceState{Volume: *volume, Muted: *muted})
	case "mic":
		plan, err = osd.PlanMic(args[1], osd.DeviceState{Volume: *volume, Muted: *muted})
	case "brightness":
		plan, err = osd.PlanBrightness(args[1], *volume)
	default:
		return cli.UsageError("usage: orgm-hypr osd [volume|mic|brightness] ACTION")
	}
	if err != nil {
		return cli.UsageError(err.Error())
	}
	if *printOnly {
		fmt.Fprintln(stdout, shellCommand(plan.Command.Name, plan.Command.Args))
		fmt.Fprintln(stdout, shellCommand("notify-send", notifyArgs(plan.Notify)))
		return nil
	}
	if err := runSilent(plan.Command.Name, plan.Command.Args, stderr); err != nil {
		return err
	}
	state := osd.DeviceState{Volume: *volume, Muted: *muted}
	if args[0] == "volume" || args[0] == "mic" {
		state = queryPamixerState(args[0] == "mic")
	}
	switch args[0] {
	case "volume":
		plan, err = osd.PlanVolume(args[1], state)
	case "mic":
		plan, err = osd.PlanMic(args[1], state)
	case "brightness":
		plan, err = osd.PlanBrightness(args[1], queryBrightnessPercent())
	}
	if err != nil {
		return cli.UsageError(err.Error())
	}
	if commandExists("notify-send") {
		_ = runSilent("notify-send", notifyArgs(plan.Notify), stderr)
	}
	return nil
}

func runMenuWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr menu [main|system|tools|performance|wifi|bluetooth|keyboard|power|keybindings]")
	}
	if args[0] == "keybindings" {
		return runMenuKeybindingsWithIO(args[1:], stdout, stderr)
	}
	flags := flag.NewFlagSet("orgm-hypr menu", flag.ContinueOnError)
	flags.SetOutput(stderr)
	printOnly := flags.Bool("print", false, "print menu or selected command")
	selectValue := flags.String("select", "", "selected label for tests/non-interactive use")
	confirm := flags.String("confirm", "", "confirm destructive action")
	if err := flags.Parse(args[1:]); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() != 0 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(0))
	}
	model, ok := menu.Model(args[0])
	if !ok {
		return cli.UsageError("usage: orgm-hypr menu [main|system|tools|performance|wifi|bluetooth|keyboard|power|keybindings]")
	}
	selection := *selectValue
	if selection == "" {
		if *printOnly {
			for _, label := range menu.Labels(model.Items) {
				fmt.Fprintln(stdout, label)
			}
			return nil
		}
		picked, err := rofiPick(model.Prompt, menu.Labels(model.Items), stderr)
		if err != nil || picked == "" {
			return nil
		}
		selection = picked
	}
	plan, ok := menu.PlanSelection(args[0], selection)
	if !ok {
		return nil
	}
	if plan.Destructive && *confirm != plan.Confirmation && !*printOnly {
		return cli.UsageError("destructive action requires --confirm %s or --print", plan.Confirmation)
	}
	if *printOnly {
		fmt.Fprintln(stdout, shellCommand(plan.Command.Name, plan.Command.Args))
		return nil
	}
	return runCommand(plan.Command.Name, plan.Command.Args, stdout, stderr, true)
}

func runMenuKeybindingsWithIO(args []string, stdout, stderr io.Writer) error {
	flags := flag.NewFlagSet("orgm-hypr menu keybindings", flag.ContinueOnError)
	flags.SetOutput(stderr)
	category := flags.String("category", "all", "keybinding category")
	if err := flags.Parse(args); err != nil {
		return cli.UsageError(err.Error())
	}
	if flags.NArg() != 0 {
		return cli.UsageError("unexpected argument: %s", flags.Arg(0))
	}
	for _, entry := range menu.KeybindingEntries(*category) {
		fmt.Fprintf(stdout, "%s\t%s\t%s\n", entry.Key, entry.Description, entry.Command)
	}
	return nil
}

func runWebappWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr webapp [list|create|remove]")
	}
	flags := flag.NewFlagSet("orgm-hypr webapp", flag.ContinueOnError)
	flags.SetOutput(stderr)
	dataHome := flags.String("xdg-data-home", defaultXDGPath("XDG_DATA_HOME", ".local/share"), "XDG data home")
	switch args[0] {
	case "list":
		format := flags.String("format", "tsv", "tsv or json")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		apps, err := webapp.List(*dataHome)
		if err != nil {
			return err
		}
		if *format == "json" {
			data, err := json.Marshal(apps)
			if err != nil {
				return err
			}
			fmt.Fprintln(stdout, string(data))
			return nil
		}
		for _, app := range apps {
			fmt.Fprintf(stdout, "%s\t%s\t%s\n", app.Name, app.URL, app.DesktopPath)
		}
		return nil
	case "create":
		dryRun := flags.Bool("dry-run", false, "print plan without writing")
		name := flags.String("name", "", "app name")
		url := flags.String("url", "", "app URL")
		browser := flags.String("browser", "chromium", "browser command")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		plan, err := webapp.CreatePlan(webapp.CreateOptions{DataHome: *dataHome, Name: *name, URL: *url, Browser: *browser})
		if err != nil {
			return cli.UsageError(err.Error())
		}
		printWebappCreatePlan(stdout, plan)
		if *dryRun {
			return nil
		}
		return writeWebappCreatePlan(plan)
	case "remove":
		dryRun := flags.Bool("dry-run", false, "print plan without deleting")
		desktop := flags.String("desktop", "", "desktop file path")
		profile := flags.Bool("profile", false, "remove profile data")
		confirm := flags.String("confirm", "", "confirmation token")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		plan, err := webapp.RemovePlan(webapp.RemoveOptions{DataHome: *dataHome, DesktopPath: *desktop, RemoveProfile: *profile, Confirm: *confirm})
		if err != nil {
			return cli.UsageError(err.Error())
		}
		for _, path := range plan.RemovePaths {
			fmt.Fprintf(stdout, "remove=%s\n", path)
		}
		if *dryRun {
			return nil
		}
		if *profile && *confirm != "delete-profile" {
			return cli.UsageError("profile removal requires --confirm delete-profile")
		}
		for _, path := range plan.RemovePaths {
			if err := os.RemoveAll(path); err != nil {
				return err
			}
		}
		return nil
	default:
		return cli.UsageError("usage: orgm-hypr webapp [list|create|remove]")
	}
}

func rofiPick(prompt string, labels []string, stderr io.Writer) (string, error) {
	cmd := exec.Command("rofi", "-dmenu", "-i", "-p", prompt)
	cmd.Stdin = strings.NewReader(strings.Join(labels, "\n") + "\n")
	cmd.Stderr = stderr
	data, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

func dmenuPick(kind, prompt string, labels []string, stderr io.Writer) (string, error) {
	var args []string
	switch kind {
	case "walker":
		args = []string{"--dmenu", "-p", strings.TrimSpace(prompt)}
	case "rofi":
		args = []string{"-dmenu", "-i", "-p", strings.TrimSpace(prompt)}
	default:
		kind = "fuzzel"
		args = []string{"--dmenu", "--prompt", prompt, "--width", "72", "--lines", "14"}
	}
	cmd := exec.Command(kind, args...)
	cmd.Stdin = strings.NewReader(strings.Join(labels, "\n") + "\n")
	cmd.Stderr = stderr
	data, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

func runOrPrintCommand(command windows.Command, printOnly bool, stdout, stderr io.Writer) error {
	if printOnly {
		fmt.Fprintln(stdout, shellCommand(command.Name, command.Args))
		return nil
	}
	cmd := exec.Command(command.Name, command.Args...)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	return cmd.Run()
}

func runSilent(name string, args []string, stderr io.Writer) error {
	cmd := exec.Command(name, args...)
	cmd.Stderr = stderr
	return cmd.Run()
}

func parsePIDRSS(value string) map[int]int {
	out := map[int]int{}
	for _, part := range strings.Split(value, ",") {
		pidText, rssText, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		pid, pidErr := strconv.Atoi(pidText)
		rss, rssErr := strconv.Atoi(rssText)
		if pidErr == nil && rssErr == nil {
			out[pid] = rss
		}
	}
	return out
}

func procRSSOwned(pid int) (int, bool) {
	data, err := os.ReadFile(filepath.Join("/proc", strconv.Itoa(pid), "status"))
	if err != nil {
		return 0, false
	}
	uid := strconv.Itoa(os.Getuid())
	rss := 0
	owned := false
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[0] == "Uid:" {
			owned = fields[1] == uid
		}
		if len(fields) >= 2 && fields[0] == "VmRSS:" {
			rss, _ = strconv.Atoi(fields[1])
		}
	}
	return rss, owned
}

func queryPamixerState(mic bool) osd.DeviceState {
	args := []string{}
	if mic {
		args = append(args, "--default-source")
	}
	volume := commandOutputInt("pamixer", append(args, "--get-volume")...)
	muted := strings.TrimSpace(commandOutputString("pamixer", append(args, "--get-mute")...)) == "true"
	return osd.DeviceState{Volume: volume, Muted: muted}
}

func queryBrightnessPercent() int {
	out := commandOutputString("brightnessctl", "-m")
	fields := strings.Split(out, ",")
	if len(fields) < 4 {
		return 0
	}
	percent := strings.TrimSuffix(strings.TrimSpace(fields[3]), "%")
	value, _ := strconv.Atoi(percent)
	return value
}

func commandOutputInt(name string, args ...string) int {
	value, _ := strconv.Atoi(strings.TrimSpace(commandOutputString(name, args...)))
	return value
}

func commandOutputString(name string, args ...string) string {
	data, err := exec.Command(name, args...).Output()
	if err != nil {
		return ""
	}
	return string(data)
}

func runCommand(name string, args []string, stdout, stderr io.Writer, background bool) error {
	if name == "" {
		return nil
	}
	cmd := exec.Command(name, args...)
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if background {
		return cmd.Start()
	}
	return cmd.Run()
}

func printWebappCreatePlan(stdout io.Writer, plan webapp.CreatePlanData) {
	fmt.Fprintf(stdout, "slug=%s\nurl=%s\ndesktop=%s\nlauncher=%s\nicon=%s\nprofile=%s\n", plan.Slug, plan.URL, plan.DesktopPath, plan.LauncherPath, plan.IconPath, plan.ProfilePath)
}

func writeWebappCreatePlan(plan webapp.CreatePlanData) error {
	if err := os.MkdirAll(filepath.Dir(plan.DesktopPath), 0o700); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(plan.LauncherPath), 0o700); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(plan.IconPath), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(plan.LauncherPath, []byte(plan.LauncherContent), 0o755); err != nil {
		return err
	}
	return os.WriteFile(plan.DesktopPath, []byte(plan.DesktopContent), 0o644)
}

func runSmartRunWithIO(args []string, stdout, stderr io.Writer) error {
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr smart-run [parse|run] QUERY...")
	}
	switch args[0] {
	case "parse":
		if len(args) < 2 {
			return cli.UsageError("usage: orgm-hypr smart-run parse QUERY...")
		}
		printSmartRunPlan(stdout, smartrun.Parse(strings.Join(args[1:], " "), commandExists))
		return nil
	case "run":
		query, printOnly, printExec, err := parseSmartRunArgs(args[1:])
		if err != nil {
			return cli.UsageError(err.Error())
		}
		plan := smartrun.Parse(query, commandExists)
		if printOnly {
			printSmartRunPlan(stdout, plan)
			return nil
		}
		execPlan := smartrun.BuildExecutionPlan(plan, smartrun.Env{Browser: envDefault("BROWSER", "chromium"), Home: os.Getenv("HOME"), HasWLCopy: commandExists("wl-copy"), HasGIO: commandExists("gio")})
		if printExec {
			printExecutionPlan(stdout, execPlan)
			return nil
		}
		return runExecutionPlan(execPlan, stdout, stderr)
	default:
		return cli.UsageError("usage: orgm-hypr smart-run [parse|run] QUERY...")
	}
}

func parseSmartRunArgs(args []string) (string, bool, bool, error) {
	printOnly := false
	printExec := false
	query := []string{}
	for _, arg := range args {
		switch arg {
		case "--print":
			printOnly = true
		case "--print-exec":
			printExec = true
		default:
			if strings.HasPrefix(arg, "--") {
				return "", false, false, fmt.Errorf("unknown flag: %s", arg)
			}
			query = append(query, arg)
		}
	}
	if len(query) == 0 {
		return "", false, false, fmt.Errorf("usage: orgm-hypr smart-run run QUERY... [--print|--print-exec]")
	}
	return strings.Join(query, " "), printOnly, printExec, nil
}

func commandExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func envDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func printExecutionPlan(stdout io.Writer, plan smartrun.ExecutionPlan) {
	for _, command := range plan.Commands {
		fmt.Fprintln(stdout, shellCommand(command.Name, command.Args))
	}
}

func runExecutionPlan(plan smartrun.ExecutionPlan, stdout, stderr io.Writer) error {
	for _, command := range plan.Commands {
		if command.Name == "" {
			continue
		}
		cmd := exec.Command(command.Name, command.Args...)
		cmd.Stdout = stdout
		cmd.Stderr = stderr
		if command.Stdin != "" {
			cmd.Stdin = strings.NewReader(command.Stdin)
		}
		if plan.Background {
			if err := cmd.Start(); err != nil {
				return err
			}
			continue
		}
		if err := cmd.Run(); err != nil {
			return err
		}
	}
	return nil
}

func printSmartRunPlan(stdout io.Writer, plan smartrun.Plan) {
	fmt.Fprintf(stdout, "kind=%s\n", plan.Kind)
	if plan.URL != "" {
		fmt.Fprintf(stdout, "url=%s\n", plan.URL)
	}
	if plan.Desktop != "" {
		fmt.Fprintf(stdout, "desktop=%s\n", plan.Desktop)
	}
	if plan.Query != "" {
		fmt.Fprintf(stdout, "query=%s\n", plan.Query)
	}
	if plan.Command != "" {
		fmt.Fprintf(stdout, "command=%s\n", plan.Command)
	}
}

func parseFocusArgs(args []string) (string, bool, error) {
	printOnly := false
	positionals := []string{}
	for _, arg := range args {
		switch arg {
		case "--print":
			printOnly = true
		default:
			if strings.HasPrefix(arg, "--") {
				return "", false, fmt.Errorf("unknown flag: %s", arg)
			}
			positionals = append(positionals, arg)
		}
	}
	if len(positionals) != 1 {
		return "", false, fmt.Errorf("usage: orgm-hypr windows focus ADDRESS [--print]")
	}
	return positionals[0], printOnly, nil
}

func readHyprClientsJSON(path string) ([]byte, error) {
	if path != "" {
		return os.ReadFile(path)
	}
	return exec.Command("hyprctl", "-j", "clients").Output()
}

func notifyArgs(payload osd.NotifyPayload) []string {
	return []string{"-a", payload.App, "-h", "string:x-canonical-private-synchronous:" + payload.SyncID, "-h", fmt.Sprintf("int:value:%d", payload.Value), "-t", strconv.Itoa(payload.TimeoutMS), payload.Title, ""}
}

func shellCommand(name string, args []string) string {
	return strings.Join(append([]string{name}, args...), " ")
}

func runWallpaper(args []string) error {
	return runWallpaperWithIO(args, os.Stdout, os.Stderr)
}

func runWallpaperWithIO(args []string, stdout, stderr io.Writer) error {
	m := wallpaper.NewManager(stdout, stderr)
	if len(args) < 1 {
		return m.Restore()
	}

	switch args[0] {
	case "data":
		flags := flag.NewFlagSet("orgm-hypr wallpaper data", flag.ContinueOnError)
		flags.SetOutput(stderr)
		var opts wallpaper.DataOptions
		var scriptArgs csvFlag
		flags.StringVar(&opts.Mode, "mode", "", "wallpaper mode: static or video")
		flags.StringVar(&opts.ManifestPath, "manifest", "", "TSV manifest path")
		flags.StringVar(&opts.JSONPath, "json", "", "Quickshell JSON output path")
		flags.StringVar(&opts.CurrentPath, "current", "", "current wallpaper path")
		flags.StringVar(&opts.Script, "script", "orgm-hypr", "script/command used by Quickshell apply actions")
		flags.Var(&scriptArgs, "script-arg", "extra script argument for Quickshell actions; may be repeated")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		opts.ScriptArgs = []string(scriptArgs)
		return wallpaper.GeneratePickerData(opts)
	case "clean-thumbs":
		flags := flag.NewFlagSet("orgm-hypr wallpaper clean-thumbs", flag.ContinueOnError)
		flags.SetOutput(stderr)
		var root string
		flags.StringVar(&root, "root", "", "wallpaper root containing folder-local .thumb caches")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
		if root == "" {
			return cli.UsageError("root path is required")
		}
		return wallpaper.CleanStaleThumbnails(root)
	case "status":
		return m.Status()
	case "current":
		path, err := m.CompatibilityCurrent()
		if err != nil {
			return err
		}
		fmt.Fprintln(stdout, path)
		return nil
	case "restore":
		return m.Restore()
	case "set-static":
		if len(args) < 2 {
			return cli.UsageError("usage: orgm-hypr wallpaper set-static PATH")
		}
		return m.SetStatic(args[1], "static")
	case "set-video":
		if len(args) < 2 {
			return cli.UsageError("usage: orgm-hypr wallpaper set-video PATH")
		}
		return m.SetVideo(args[1])
	case "pick", "next", "change":
		return m.MenuPick()
	case "carousel":
		if len(args) < 2 {
			return cli.UsageError("usage: orgm-hypr wallpaper carousel [static|video]")
		}
		return m.OpenQuickshellCarousel(args[1])
	case "warm-thumbs":
		if len(args) < 2 {
			return cli.UsageError("usage: orgm-hypr wallpaper warm-thumbs [static|video] [index]")
		}
		index := "0"
		if len(args) > 2 {
			index = args[2]
		}
		return m.WarmThumbs(args[1], index, 5)
	case "warm-page":
		if len(args) < 2 {
			return cli.UsageError("usage: orgm-hypr wallpaper warm-page [static|video] [page] [page-size]")
		}
		page := parseIntDefault(argAt(args, 2), 0)
		pageSize := parseIntDefault(argAt(args, 3), 16)
		return m.WarmPage(args[1], page, pageSize)
	case "picker-daemon":
		return m.StartQuickshellPicker(false)
	case "daemon":
		return m.RunDaemon()
	default:
		return cli.UsageError("usage: orgm-hypr wallpaper [restore|current|pick|carousel static|carousel video|set-static PATH|set-video PATH|status]")
	}
}

func argAt(args []string, idx int) string {
	if len(args) > idx {
		return args[idx]
	}
	return ""
}

func parseIntDefault(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

type csvFlag []string

func (f *csvFlag) String() string { return fmt.Sprint([]string(*f)) }

func (f *csvFlag) Set(value string) error {
	*f = append(*f, value)
	return nil
}

func usage() string {
	return "usage: orgm-hypr [version|wallpaper|theme|session|waybar|dock|windows|zen|osd|menu|updates|webapp|notify|smart-run] ..."
}
