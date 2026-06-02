package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/osmargm1202/nixos/internal/cli"
	"github.com/osmargm1202/nixos/internal/orgmtheme"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		os.Exit(cli.PrintError(os.Stderr, err))
	}
}

func run(args []string) error {
	return runWithIO(args, os.Stdout, os.Stderr, osEnvMap())
}

func runWithIO(args []string, stdout, stderr io.Writer, env map[string]string) error {
	paths := pathsFromEnv(env)
	if len(args) < 1 {
		return cli.UsageError(usage())
	}
	if len(args) > 1 && (args[0] == "list" || args[0] == "current" || args[0] == "status" || args[0] == "toggle") {
		return cli.UsageError("unexpected argument: %s", args[1])
	}

	switch args[0] {
	case "list":
		themes, err := orgmtheme.ListThemes(paths.themesDir)
		if err != nil {
			return err
		}
		for _, theme := range themes {
			fmt.Fprintln(stdout, theme)
		}
		return nil
	case "current":
		fmt.Fprintln(stdout, currentTheme(paths.currentFile))
		return nil
	case "status":
		name := currentTheme(paths.currentFile)
		theme, err := orgmtheme.LoadTheme(paths.themesDir, name)
		if err != nil {
			return err
		}
		fmt.Fprintf(stdout, "Theme: %s\nGTK: %s\nIcons: %s\nCursor: %s %s\nColor scheme: %s\nPi theme: %s\n", theme.Name, theme.GTKTheme, theme.IconTheme, theme.CursorTheme, theme.CursorSize, theme.ColorScheme, theme.PITheme)
		return nil
	case "apply":
		if len(args) != 2 {
			return cli.UsageError("usage: orgm-themes apply THEME")
		}
		return cli.UsageError("orgm-themes apply is not implemented yet")
	case "toggle":
		return cli.UsageError("orgm-themes toggle is not implemented yet")
	case "-h", "--help", "help":
		fmt.Fprintln(stdout, usage())
		return nil
	default:
		return cli.UsageError(usage())
	}
}

type themePaths struct {
	themesDir   string
	currentFile string
}

func pathsFromEnv(env map[string]string) themePaths {
	home := env["HOME"]
	configHome := env["XDG_CONFIG_HOME"]
	if configHome == "" {
		configHome = filepath.Join(home, ".config")
	}
	stateHome := env["XDG_STATE_HOME"]
	if stateHome == "" {
		stateHome = filepath.Join(home, ".local", "state")
	}
	themesDir := env["ORGM_THEMES_DIR"]
	if themesDir == "" {
		themesDir = filepath.Join(configHome, "orgm-theme", "themes")
	}
	return themePaths{
		themesDir:   themesDir,
		currentFile: filepath.Join(stateHome, "orgm-theme", "current"),
	}
}

func currentTheme(path string) string {
	content, err := os.ReadFile(path)
	if err != nil {
		return "orgm-dark"
	}
	name := strings.TrimSpace(string(content))
	if name == "" {
		return "orgm-dark"
	}
	return name
}

func osEnvMap() map[string]string {
	env := make(map[string]string)
	for _, item := range os.Environ() {
		key, value, ok := strings.Cut(item, "=")
		if ok {
			env[key] = value
		}
	}
	return env
}

func usage() string {
	return `usage: orgm-themes <command> [theme]

commands:
  list              list available themes
  current           print current theme
  status            show current theme and key toolkit settings
  apply THEME       apply theme (not implemented yet)
  toggle            toggle orgm-dark/orgm-light (not implemented yet)`
}
