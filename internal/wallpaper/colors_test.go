package wallpaper

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/osmargm1202/nixos/internal/orgmtheme"
)

// fakeMatugenJSON is a minimal valid matugen 3.x --json hex output.
// Format: colors keyed by token name, each with dark/light/default sub-keys.
const fakeMatugenJSON = `{
  "colors": {
    "primary":                  {"dark": "#6d9eeb", "light": "#1e66f5", "default": "#6d9eeb"},
    "on_primary":               {"dark": "#002b7c", "light": "#ffffff", "default": "#002b7c"},
    "background":               {"dark": "#1a1c2e", "light": "#eff1f5", "default": "#1a1c2e"},
    "on_background":            {"dark": "#e2e4f6", "light": "#4c4f69", "default": "#e2e4f6"},
    "surface_container":        {"dark": "#252736", "light": "#e6e9ef", "default": "#252736"},
    "surface_container_low":    {"dark": "#1e2030", "light": "#eceef4", "default": "#1e2030"},
    "surface_container_lowest": {"dark": "#181926", "light": "#ffffff", "default": "#181926"},
    "surface_container_high":   {"dark": "#2e3048", "light": "#dce0e8", "default": "#2e3048"},
    "surface_container_highest":{"dark": "#393b54", "light": "#ccd0da", "default": "#393b54"},
    "outline_variant":          {"dark": "#43456a", "light": "#8087a2", "default": "#43456a"},
    "outline":                  {"dark": "#5f6290", "light": "#6c6f85", "default": "#5f6290"},
    "on_surface_variant":       {"dark": "#9b9ec7", "light": "#5b6078", "default": "#9b9ec7"},
    "on_surface":               {"dark": "#c4c6e3", "light": "#4c4f69", "default": "#c4c6e3"},
    "secondary":                {"dark": "#8bd5ca", "light": "#179299", "default": "#8bd5ca"},
    "tertiary":                 {"dark": "#c6a0f6", "light": "#8839ef", "default": "#c6a0f6"},
    "primary_fixed_dim":        {"dark": "#91d7e3", "light": "#0089a0", "default": "#91d7e3"},
    "secondary_fixed":          {"dark": "#a6da95", "light": "#40a02b", "default": "#a6da95"},
    "tertiary_fixed":           {"dark": "#eed49f", "light": "#df8e1d", "default": "#eed49f"},
    "primary_container":        {"dark": "#3d5f9e", "light": "#b7bdf8", "default": "#3d5f9e"},
    "error":                    {"dark": "#ed8796", "light": "#d20f39", "default": "#ed8796"},
    "tertiary_container":       {"dark": "#523d6e", "light": "#ea76cb", "default": "#523d6e"},
    "on_tertiary_container":    {"dark": "#f4dbd6", "light": "#4c4f69", "default": "#f4dbd6"},
    "on_secondary_container":   {"dark": "#f0c6c6", "light": "#cba6f7", "default": "#f0c6c6"}
  }
}`

func writeFakeMatugen(t *testing.T, tmpDir string) {
	t.Helper()
	bin := filepath.Join(tmpDir, "matugen")
	script := "#!/bin/sh\nprintf '%s' '" + fakeMatugenJSON + "'\n"
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake matugen: %v", err)
	}
	t.Setenv("MATUGEN_BIN", bin)
}

func TestRunMatugen(t *testing.T) {
	tmp := t.TempDir()
	writeFakeMatugen(t, tmp)

	img := filepath.Join(tmp, "wall.png")
	if err := os.WriteFile(img, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, err := runMatugen(img)
	if err != nil {
		t.Fatalf("runMatugen: %v", err)
	}
	if got := out.Colors["primary"].Dark; got != "#6d9eeb" {
		t.Errorf("dark primary = %q, want #6d9eeb", got)
	}
	if got := out.Colors["primary"].Light; got != "#1e66f5" {
		t.Errorf("light primary = %q, want #1e66f5", got)
	}
}

func baseTheme(scheme string) orgmtheme.Theme {
	return orgmtheme.Theme{
		Name:                   "orgm-dark",
		ColorScheme:            scheme,
		GTKTheme:               "Adwaita-dark",
		IconTheme:              "Adwaita",
		CursorTheme:            "Catppuccin-Macchiato-Teal-Cursors",
		CursorSize:             "36",
		QTStyle:                "Darkly",
		PITheme:                "orgm",
		KittyBackgroundOpacity: "0.90",
	}
}

func TestMapColors_Dark(t *testing.T) {
	out := parseFakeJSON(t)
	result := MapColors(out.palette("prefer-dark"), baseTheme("prefer-dark"))

	if result.GTKTheme != "Adwaita-dark" {
		t.Errorf("GTKTheme = %q, want Adwaita-dark", result.GTKTheme)
	}
	if result.Blue != "6d9eeb" {
		t.Errorf("Blue = %q, want 6d9eeb", result.Blue)
	}
	if result.Base != "1a1c2e" {
		t.Errorf("Base = %q, want 1a1c2e", result.Base)
	}
	if result.Text != "e2e4f6" {
		t.Errorf("Text = %q, want e2e4f6", result.Text)
	}
	if result.Red != "ed8796" {
		t.Errorf("Red = %q, want ed8796", result.Red)
	}
	if result.PanelBG != "1a1c2e99" {
		t.Errorf("PanelBG = %q, want 1a1c2e99", result.PanelBG)
	}
	if result.QSCard != "22252736" {
		t.Errorf("QSCard = %q, want 22252736", result.QSCard)
	}
}

func TestMapColors_Light(t *testing.T) {
	out := parseFakeJSON(t)
	result := MapColors(out.palette("prefer-light"), baseTheme("prefer-light"))

	if result.Blue != "1e66f5" {
		t.Errorf("Blue = %q, want 1e66f5", result.Blue)
	}
	if result.PanelBG != "eff1f5dd" {
		t.Errorf("PanelBG = %q, want eff1f5dd", result.PanelBG)
	}
	if result.MenuBG != "eff1f5ee" {
		t.Errorf("MenuBG = %q, want eff1f5ee", result.MenuBG)
	}
}

// parseFakeJSON is a helper for Task 3 (TestMapColors).
func parseFakeJSON(t *testing.T) matugenOutput {
	t.Helper()
	var out matugenOutput
	if err := json.Unmarshal([]byte(fakeMatugenJSON), &out); err != nil {
		t.Fatalf("parseFakeJSON: %v", err)
	}
	return out
}

func newTestManager(t *testing.T) (*Manager, string) {
	t.Helper()
	tmp := t.TempDir()
	m := NewManager(os.Stdout, os.Stderr)
	m.StateDir = filepath.Join(tmp, "state")
	m.StateFile = filepath.Join(m.StateDir, "state")
	if err := os.MkdirAll(m.StateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	return m, tmp
}

func TestColorSourceImage_Static(t *testing.T) {
	m, tmp := newTestManager(t)
	wallpaper := filepath.Join(tmp, "wall.png")
	if err := os.WriteFile(wallpaper, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(m.StateFile, []byte("mode=static\npath="+wallpaper+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := m.ColorSourceImage()
	if err != nil {
		t.Fatalf("ColorSourceImage: %v", err)
	}
	if got != wallpaper {
		t.Errorf("got %q, want %q", got, wallpaper)
	}
}

func TestColorSourceImage_Video_ThumbExists(t *testing.T) {
	m, tmp := newTestManager(t)
	video := filepath.Join(tmp, "Videos", "wallpapers", "city.mp4")
	if err := os.MkdirAll(filepath.Dir(video), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(video, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	// Pre-create thumb so ffmpeg is never called.
	thumb := filepath.Join(filepath.Dir(video), ".thumb", "city.mp4.jpg")
	if err := os.MkdirAll(filepath.Dir(thumb), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(thumb, []byte("fake-jpeg-data"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(m.StateFile, []byte("mode=video\npath="+video+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	got, err := m.ColorSourceImage()
	if err != nil {
		t.Fatalf("ColorSourceImage: %v", err)
	}
	if got != thumb {
		t.Errorf("got %q, want %q", got, thumb)
	}
}

func TestColorSourceImage_NoWallpaper(t *testing.T) {
	m, _ := newTestManager(t)
	// StateFile does not exist → no wallpaper set.

	_, err := m.ColorSourceImage()
	if err == nil {
		t.Error("expected error when no wallpaper set, got nil")
	}
}

func writeThemeEnv(t *testing.T, dir, name string) {
	t.Helper()
	themesDir := filepath.Join(dir, "orgm-theme", "themes")
	if err := os.MkdirAll(themesDir, 0o755); err != nil {
		t.Fatal(err)
	}
	content := `# test theme
THEME_NAME=` + name + `
COLOR_SCHEME=prefer-dark
GTK_THEME=Adwaita-dark
ICON_THEME=Adwaita
CURSOR_THEME=Catppuccin-Macchiato-Teal-Cursors
CURSOR_SIZE=36
QT_STYLE=Darkly
PI_THEME=orgm
KITTY_BACKGROUND_OPACITY=0.90
BASE=24273a
MANTLE=1e2030
CRUST=181926
TEXT=cad3f5
SUBTEXT0=a5adcb
SUBTEXT1=b8c0e0
SURFACE0=363a4f
SURFACE1=494d64
SURFACE2=5b6078
OVERLAY0=6e738d
OVERLAY1=8087a2
OVERLAY2=939ab7
BLUE=8aadf4
GREEN=a6da95
YELLOW=eed49f
PEACH=f5a97f
RED=ed8796
MAUVE=c6a0f6
PINK=f5bde6
TEAL=8bd5ca
SKY=91d7e3
ROSEWATER=f4dbd6
PANEL_BG=00000099
MENU_BG=000000dd
QS_OVERLAY=000000
QS_CARD=22363a4f
QS_CARD_STRONG=33494d64
QS_CARD_SOFT=1e363a4f
QS_EVENT=2b363a4f
QS_HOVER=55363a4f
ON_ACCENT=11111b
`
	if err := os.WriteFile(filepath.Join(themesDir, name+".env"), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestApplyColors_DryRun(t *testing.T) {
	tmp := t.TempDir()
	writeFakeMatugen(t, tmp)

	// Set up wallpaper image.
	wallpaper := filepath.Join(tmp, "wall.png")
	if err := os.WriteFile(wallpaper, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Set up manager with temp dirs.
	m, _ := newTestManager(t)
	m.StateHome = filepath.Join(tmp, "state")
	m.ConfigHome = filepath.Join(tmp, "config")
	m.DataHome = filepath.Join(tmp, "data")

	// Write current theme state.
	themeStateDir := filepath.Join(m.StateHome, "orgm-theme")
	if err := os.MkdirAll(themeStateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(themeStateDir, "current"), []byte("orgm-dark\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Write theme .env file.
	writeThemeEnv(t, m.ConfigHome, "orgm-dark")

	// Write wallpaper state.
	if err := os.MkdirAll(m.StateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(m.StateFile, []byte("mode=static\npath="+wallpaper+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Capture stdout.
	r, w, _ := os.Pipe()
	m.Stdout = w

	err := m.ApplyColors(ApplyColorsOptions{DryRun: true})
	w.Close()
	if err != nil {
		t.Fatalf("ApplyColors dry-run: %v", err)
	}

	buf := make([]byte, 4096)
	n, _ := r.Read(buf)
	output := string(buf[:n])

	// Dry-run should list at least the waybar and kitty write paths.
	if !strings.Contains(output, "waybar") {
		t.Errorf("dry-run output missing waybar path: %s", output)
	}
	if !strings.Contains(output, "kitty") {
		t.Errorf("dry-run output missing kitty path: %s", output)
	}
}
