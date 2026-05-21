package main

import (
	"flag"
	"fmt"
	"os"

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
	if len(args) < 1 {
		return cli.UsageError("usage: orgm-hypr wallpaper [data|clean-thumbs] ...")
	}

	switch args[0] {
	case "data":
		flags := flag.NewFlagSet("orgm-hypr wallpaper data", flag.ContinueOnError)
		flags.SetOutput(os.Stderr)
		var opts wallpaper.DataOptions
		flags.StringVar(&opts.Mode, "mode", "", "wallpaper mode: static or video")
		flags.StringVar(&opts.ManifestPath, "manifest", "", "TSV manifest path")
		flags.StringVar(&opts.JSONPath, "json", "", "Quickshell JSON output path")
		flags.StringVar(&opts.CurrentPath, "current", "", "current wallpaper path")
		flags.StringVar(&opts.Script, "script", "orgm-hypr", "script/command used by Quickshell apply actions")
		if err := flags.Parse(args[1:]); err != nil {
			return cli.UsageError(err.Error())
		}
		if flags.NArg() != 0 {
			return cli.UsageError("unexpected argument: %s", flags.Arg(0))
		}
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
	default:
		return cli.UsageError("usage: orgm-hypr wallpaper [data|clean-thumbs] ...")
	}
}

func usage() string {
	return "usage: orgm-hypr [version|wallpaper|waybar|dock|zen|menu|updates|webapp|windows|notify|smart-run] ..."
}
