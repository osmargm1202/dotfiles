package main

import (
	"flag"
	"fmt"
	"os"
	"strconv"

	"github.com/osmarg/dotfiles/orgm-hypr/internal/cli"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/wallpaper"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		os.Exit(cli.PrintError(os.Stderr, err))
	}
}

func run(args []string) error {
	if len(args) < 1 {
		return cli.UsageError(usage())
	}

	switch args[0] {
	case "version":
		fmt.Println("orgm-hypr dev")
		return nil
	case "wallpaper":
		return runWallpaper(args[1:])
	case "waybar", "dock", "zen", "menu", "updates", "webapp", "windows", "notify", "smart-run":
		return cli.UsageError("%s: command group not implemented yet", args[0])
	default:
		return cli.UsageError(usage())
	}
}

func runWallpaper(args []string) error {
	m := wallpaper.NewManager(os.Stdout, os.Stderr)
	if len(args) < 1 {
		return m.Restore()
	}

	switch args[0] {
	case "data":
		flags := flag.NewFlagSet("orgm-hypr wallpaper data", flag.ContinueOnError)
		flags.SetOutput(os.Stderr)
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
		flags.SetOutput(os.Stderr)
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
		return cli.UsageError("usage: orgm-hypr wallpaper [restore|pick|carousel static|carousel video|set-static PATH|set-video PATH|status]")
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
	return "usage: orgm-hypr [version|wallpaper|waybar|dock|zen|menu|updates|webapp|windows|notify|smart-run] ..."
}
