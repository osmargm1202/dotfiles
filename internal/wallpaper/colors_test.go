package wallpaper

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
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

// parseFakeJSON is a helper for Task 3 (TestMapColors).
func parseFakeJSON(t *testing.T) matugenOutput {
	t.Helper()
	var out matugenOutput
	if err := json.Unmarshal([]byte(fakeMatugenJSON), &out); err != nil {
		t.Fatalf("parseFakeJSON: %v", err)
	}
	return out
}
