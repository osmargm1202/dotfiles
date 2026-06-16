package wallpaper

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"

	"github.com/osmargm1202/nixos/internal/orgmtheme"
)

// matugenOutput is the top-level JSON structure from `matugen image <path> --json hex`.
type matugenOutput struct {
	Colors struct {
		Dark  map[string]string `json:"dark"`
		Light map[string]string `json:"light"`
	} `json:"colors"`
}

// runMatugen runs matugen on imagePath and returns the parsed color palette.
// The binary is resolved via the MATUGEN_BIN env var, falling back to "matugen".
func runMatugen(imagePath string) (matugenOutput, error) {
	bin := envDefault("MATUGEN_BIN", "matugen")
	out, err := exec.Command(bin, "image", imagePath, "--json", "hex").Output()
	if err != nil {
		return matugenOutput{}, fmt.Errorf("matugen: %w", err)
	}
	var result matugenOutput
	if err := json.Unmarshal(out, &result); err != nil {
		return matugenOutput{}, fmt.Errorf("matugen parse: %w", err)
	}
	return result, nil
}

// MapColors replaces all color fields in base with values from a matugen palette.
// Non-color identity fields (GTKTheme, IconTheme, CursorTheme, etc.) are preserved.
func MapColors(palette map[string]string, base orgmtheme.Theme) orgmtheme.Theme {
	t := base
	get := func(key string) string { return strings.TrimPrefix(palette[key], "#") }

	bgHex := get("background")
	sc := get("surface_container")

	t.Base = bgHex
	t.Mantle = get("surface_container_low")
	t.Crust = get("surface_container_lowest")
	t.Surface0 = sc
	t.Surface1 = get("surface_container_high")
	t.Surface2 = get("surface_container_highest")
	t.Overlay0 = get("outline_variant")
	t.Overlay1 = get("outline")
	t.Overlay2 = get("on_surface_variant")
	t.Text = get("on_background")
	t.Subtext0 = get("on_surface_variant")
	t.Subtext1 = get("on_surface")
	t.Blue = get("primary")
	t.Mauve = get("tertiary")
	t.Teal = get("secondary")
	t.Sky = get("primary_fixed_dim")
	t.Green = get("secondary_fixed")
	t.Yellow = get("tertiary_fixed")
	t.Peach = get("primary_container")
	t.Red = get("error")
	t.Pink = get("tertiary_container")
	t.Rosewater = get("on_tertiary_container")
	t.OnAccent = get("on_primary")

	if base.ColorScheme == "prefer-light" {
		t.PanelBG = bgHex + "dd"
		t.MenuBG = bgHex + "ee"
	} else {
		t.PanelBG = bgHex + "99"
		t.MenuBG = bgHex + "dd"
	}

	t.QSOverlay = bgHex
	t.QSCard = "22" + sc
	t.QSCardStrong = "33" + get("surface_container_high")
	t.QSCardSoft = "1e" + sc
	t.QSEvent = "2b" + sc
	t.QSHover = "55" + sc

	return t
}
