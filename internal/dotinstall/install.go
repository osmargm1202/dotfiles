package dotinstall

import (
	"fmt"
	"os"
	"path/filepath"
)

func Run(home, executable string) ([]string, error) {
	if executable == "" {
		var err error
		executable, err = os.Executable()
		if err != nil {
			return nil, err
		}
	}
	binDir := filepath.Join(home, ".local", "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		return nil, err
	}
	links := []string{filepath.Join(binDir, "dot"), filepath.Join(binDir, "dot.sh")}
	for _, link := range links {
		_ = os.Remove(link)
		if err := os.Symlink(executable, link); err != nil {
			return nil, err
		}
	}
	return []string{
		fmt.Sprintf("installed: %s -> %s", links[0], executable),
		fmt.Sprintf("installed: %s -> %s", links[1], executable),
		"launch example: dot daemon --host orgm",
	}, nil
}
