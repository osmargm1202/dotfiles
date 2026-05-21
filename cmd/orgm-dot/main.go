package main

import (
	"fmt"
	"os"

	"github.com/osmarg/dotfiles/orgm-hypr/internal/dotcli"
	"github.com/osmarg/dotfiles/orgm-hypr/internal/dotconfig"
)

func main() {
	cmd, err := dotcli.Parse(os.Args[1:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "orgm-dot: %s\n", err)
		fmt.Fprint(os.Stderr, dotcli.Usage)
		os.Exit(1)
	}

	switch cmd.Name {
	case "help":
		fmt.Print(dotcli.Usage)
	case "version":
		fmt.Println("orgm-dot dev")
	case "status":
		if err := cmd.RequireHost(); err != nil {
			fatal(err)
		}
		runtime, err := dotconfig.Load(cmd.Config)
		if err != nil {
			fatal(err)
		}
		for _, line := range runtime.StatusLines(cmd.Host) {
			fmt.Println(line)
		}
	case "diff", "sync", "daemon", "add", "remove", "install":
		fmt.Fprintf(os.Stderr, "orgm-dot: %s not implemented yet\n", cmd.Name)
		os.Exit(2)
	default:
		fmt.Fprintf(os.Stderr, "orgm-dot: unknown command: %s\n", cmd.Name)
		os.Exit(2)
	}
}

func fatal(err error) {
	fmt.Fprintf(os.Stderr, "orgm-dot: %s\n", err)
	os.Exit(1)
}
