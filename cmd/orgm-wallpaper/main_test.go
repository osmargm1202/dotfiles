package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSetStaticAcceptsMonitorFlag(t *testing.T) {
	root := t.TempDir()
	bin := filepath.Join(root, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		t.Fatalf("mkdir bin: %v", err)
	}
	writeExecutable(t, filepath.Join(bin, "hyprpaper"), "#!/bin/sh\nexit 0\n")
	wallpaper := filepath.Join(root, "wall.png")
	if err := os.WriteFile(wallpaper, []byte("x"), 0o600); err != nil {
		t.Fatalf("write wallpaper: %v", err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("HOME", root)
	t.Setenv("XDG_STATE_HOME", filepath.Join(root, "state"))
	t.Setenv("XDG_RUNTIME_DIR", filepath.Join(root, "runtime"))

	var stdout, stderr bytes.Buffer
	if err := runWithIO([]string{"set-static", wallpaper, "--monitor", "DP-3"}, &stdout, &stderr); err != nil {
		t.Fatalf("runWithIO set-static --monitor error = %v stderr=%s", err, stderr.String())
	}

	statePath := filepath.Join(root, "state", "hypr-wallpaper", "monitors", "DP-3.state")
	state, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read monitor state: %v", err)
	}
	if got := string(state); !strings.Contains(got, "mode=static") || !strings.Contains(got, "path="+wallpaper) {
		t.Fatalf("state = %q, want static monitor wallpaper", got)
	}
}

func TestStatusAcceptsMonitorFlag(t *testing.T) {
	root := t.TempDir()
	wallpaper := filepath.Join(root, "wall.png")
	if err := os.WriteFile(wallpaper, []byte("x"), 0o600); err != nil {
		t.Fatalf("write wallpaper: %v", err)
	}
	t.Setenv("HOME", root)
	t.Setenv("XDG_STATE_HOME", filepath.Join(root, "state"))
	stateDir := filepath.Join(root, "state", "hypr-wallpaper", "monitors")
	if err := os.MkdirAll(stateDir, 0o755); err != nil {
		t.Fatalf("mkdir state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(stateDir, "DP-3.state"), []byte("mode=static\npath="+wallpaper+"\n"), 0o644); err != nil {
		t.Fatalf("write state: %v", err)
	}

	var stdout, stderr bytes.Buffer
	if err := runWithIO([]string{"status", "--monitor", "DP-3"}, &stdout, &stderr); err != nil {
		t.Fatalf("runWithIO status --monitor error = %v stderr=%s", err, stderr.String())
	}
	for _, want := range []string{"monitor=DP-3", "mode=static", "path=" + wallpaper} {
		if !strings.Contains(stdout.String(), want) {
			t.Fatalf("stdout = %q, want %q", stdout.String(), want)
		}
	}
}

func writeExecutable(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir parent: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatalf("write executable: %v", err)
	}
}
