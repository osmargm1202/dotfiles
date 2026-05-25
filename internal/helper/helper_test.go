package helper

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildCacheUsesMenuCategories(t *testing.T) {
	cache := BuildCache()
	if cache.SchemaVersion != 1 {
		t.Fatalf("schemaVersion = %d, want 1", cache.SchemaVersion)
	}
	if cache.DefaultCategory != "launchers" {
		t.Fatalf("defaultCategory = %q, want launchers", cache.DefaultCategory)
	}
	if len(cache.Categories) == 0 {
		t.Fatalf("cache categories empty")
	}
	if len(cache.Categories[0].Entries) == 0 {
		t.Fatalf("first category entries empty: %#v", cache.Categories[0])
	}
	if cache.Categories[0].Entries[0].Command != "orgm-hypr helper toggle" {
		t.Fatalf("first cache entry = %#v, want helper toggle", cache.Categories[0].Entries[0])
	}
}

func TestInitWritesValidJSON(t *testing.T) {
	state := t.TempDir()
	var out, errOut strings.Builder
	if err := Run([]string{"init", "--state-home", state}, &out, &errOut); err != nil {
		t.Fatalf("Run(init) error = %v", err)
	}
	path := filepath.Join(state, "orgm-helper", "keybindings.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read cache: %v", err)
	}
	var cache Cache
	if err := json.Unmarshal(data, &cache); err != nil {
		t.Fatalf("cache json invalid: %v\n%s", err, data)
	}
	if !strings.Contains(out.String(), path) {
		t.Fatalf("stdout = %q, want cache path", out.String())
	}
}

func TestKeyhelperShellPathUsesXDGConfigHome(t *testing.T) {
	config := filepath.Join(t.TempDir(), "config")
	t.Setenv("XDG_CONFIG_HOME", config)
	t.Setenv("HOME", filepath.Join(t.TempDir(), "home"))

	got := keyhelperShellPath()
	want := filepath.Join(config, "quickshell", "modules", "keyhelper", "shell.qml")
	if got != want {
		t.Fatalf("keyhelperShellPath() = %q, want %q", got, want)
	}
}

func TestKeyhelperShellPathFallsBackToHomeConfig(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("HOME", home)

	got := keyhelperShellPath()
	want := filepath.Join(home, ".config", "quickshell", "modules", "keyhelper", "shell.qml")
	if got != want {
		t.Fatalf("keyhelperShellPath() = %q, want %q", got, want)
	}
}

func TestTogglePrintWritesCacheAndRequest(t *testing.T) {
	state := t.TempDir()
	var out, errOut strings.Builder
	if err := Run([]string{"toggle", "--state-home", state, "--print"}, &out, &errOut); err != nil {
		t.Fatalf("Run(toggle --print) error = %v", err)
	}
	for _, rel := range []string{"keybindings.json", "keyhelper-request.json"} {
		path := filepath.Join(state, "orgm-helper", rel)
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected %s: %v", path, err)
		}
	}
	if !strings.Contains(out.String(), "quickshell") || !strings.Contains(out.String(), "modules/keyhelper/shell.qml") {
		t.Fatalf("stdout = %q, want quickshell command", out.String())
	}
}

func TestRunRejectsInvalidSubcommand(t *testing.T) {
	var out, errOut strings.Builder
	err := Run([]string{"wat"}, &out, &errOut)
	if err == nil || !strings.Contains(err.Error(), "usage: orgm-hypr helper [init|toggle]") {
		t.Fatalf("err = %v, want usage", err)
	}
}
