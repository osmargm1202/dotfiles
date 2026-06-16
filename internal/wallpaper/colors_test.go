package wallpaper

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/osmargm1202/nixos/internal/orgmtheme"
)

// fakeMatugenJSON is a minimal valid matugen --json hex output.
const fakeMatugenJSON = `{
  "colors": {
    "dark": {
      "primary": "#6d9eeb",
      "on_primary": "#002b7c",
      "background": "#1a1c2e",
      "on_background": "#e2e4f6",
      "surface_container": "#252736",
      "surface_container_low": "#1e2030",
      "surface_container_lowest": "#181926",
      "surface_container_high": "#2e3048",
      "surface_container_highest": "#393b54",
      "outline_variant": "#43456a",
      "outline": "#5f6290",
      "on_surface_variant": "#9b9ec7",
      "on_surface": "#c4c6e3",
      "secondary": "#8bd5ca",
      "tertiary": "#c6a0f6",
      "primary_fixed_dim": "#91d7e3",
      "secondary_fixed": "#a6da95",
      "tertiary_fixed": "#eed49f",
      "primary_container": "#3d5f9e",
      "error": "#ed8796",
      "tertiary_container": "#523d6e",
      "on_tertiary_container": "#f4dbd6",
      "on_secondary_container": "#f0c6c6"
    },
    "light": {
      "primary": "#1e66f5",
      "on_primary": "#ffffff",
      "background": "#eff1f5",
      "on_background": "#4c4f69",
      "surface_container": "#e6e9ef",
      "surface_container_low": "#eceef4",
      "surface_container_lowest": "#ffffff",
      "surface_container_high": "#dce0e8",
      "surface_container_highest": "#ccd0da",
      "outline_variant": "#8087a2",
      "outline": "#6c6f85",
      "on_surface_variant": "#5b6078",
      "on_surface": "#4c4f69",
      "secondary": "#179299",
      "tertiary": "#8839ef",
      "primary_fixed_dim": "#0089a0",
      "secondary_fixed": "#40a02b",
      "tertiary_fixed": "#df8e1d",
      "primary_container": "#b7bdf8",
      "error": "#d20f39",
      "tertiary_container": "#ea76cb",
      "on_tertiary_container": "#4c4f69",
      "on_secondary_container": "#cba6f7"
    }
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
	if got := out.Colors.Dark["primary"]; got != "#6d9eeb" {
		t.Errorf("dark primary = %q, want #6d9eeb", got)
	}
	if got := out.Colors.Light["primary"]; got != "#1e66f5" {
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
	result := MapColors(out.Colors.Dark, baseTheme("prefer-dark"))

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
	result := MapColors(out.Colors.Light, baseTheme("prefer-light"))

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
