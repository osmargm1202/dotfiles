package wallpaper

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/osmargm1202/nixos/internal/orgmtheme"
)

// matugenColor holds the dark/light/default variants for one color token.
type matugenColor struct {
	Dark    string `json:"dark"`
	Light   string `json:"light"`
	Default string `json:"default"`
}

// matugenOutput is the top-level JSON structure from `matugen image <path> --json hex`.
// Colors is keyed by token name (e.g. "background", "primary"); each value has dark/light variants.
type matugenOutput struct {
	Colors map[string]matugenColor `json:"colors"`
}

// palette returns a flat map of token→hex for the requested scheme.
func (m matugenOutput) palette(scheme string) map[string]string {
	out := make(map[string]string, len(m.Colors))
	for name, c := range m.Colors {
		if scheme == "prefer-light" {
			out[name] = c.Light
		} else {
			out[name] = c.Dark
		}
	}
	return out
}

// nixMatugenPaths are fallback locations when matugen is not on PATH (NixOS).
var nixMatugenPaths = []string{
	"/run/current-system/sw/bin/matugen",
	"/etc/profiles/per-user/osmarg/bin/matugen",
	"/home/osmarg/.nix-profile/bin/matugen",
	"/nix/profile/bin/matugen",
}

// resolveMatugen returns the path to a usable matugen binary.
func resolveMatugen() (string, error) {
	if bin := os.Getenv("MATUGEN_BIN"); bin != "" {
		return bin, nil
	}
	if path, err := exec.LookPath("matugen"); err == nil {
		return path, nil
	}
	for _, p := range nixMatugenPaths {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("matugen binary not found in PATH or %v", nixMatugenPaths)
}

// runMatugen runs matugen on imagePath and returns the parsed color palette.
func runMatugen(imagePath string) (matugenOutput, error) {
	bin, err := resolveMatugen()
	if err != nil {
		return matugenOutput{}, err
	}
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

// ApplyColorsOptions controls ApplyColors behaviour.
type ApplyColorsOptions struct {
	NoReload bool
	DryRun   bool
}

// ApplyColors extracts a color palette from the active wallpaper via matugen,
// maps it onto the current orgm theme, and regenerates all themed component files.
func (m *Manager) ApplyColors(opts ApplyColorsOptions) error {
	src, err := m.ColorSourceImage()
	if err != nil {
		return fmt.Errorf("source image: %w", err)
	}

	matout, err := runMatugen(src)
	if err != nil {
		return err
	}

	themeName := readTrim(filepath.Join(m.StateHome, "orgm-theme", "current"))
	if themeName == "" {
		themeName = "orgm-dark"
	}
	themesDir := filepath.Join(m.ConfigHome, "orgm-theme", "themes")
	base, err := orgmtheme.LoadTheme(themesDir, themeName)
	if err != nil {
		return fmt.Errorf("load theme: %w", err)
	}

	theme := MapColors(matout.palette(base.ColorScheme), base)
	env := orgmtheme.Env{ConfigHome: m.ConfigHome, DataHome: m.DataHome}
	writes, err := orgmtheme.BuildWrites(env, theme)
	if err != nil {
		return fmt.Errorf("build writes: %w", err)
	}

	if opts.DryRun {
		for _, w := range writes {
			fmt.Fprintf(m.Stdout, "write %s\n", w.Path)
		}
		return nil
	}

	for _, w := range writes {
		if err := os.MkdirAll(filepath.Dir(w.Path), 0o755); err != nil {
			return fmt.Errorf("mkdir %s: %w", filepath.Dir(w.Path), err)
		}
		// Remove symlinks before writing so we don't try to overwrite nix-store files.
		if fi, err := os.Lstat(w.Path); err == nil && fi.Mode()&os.ModeSymlink != 0 {
			if err := os.Remove(w.Path); err != nil {
				return fmt.Errorf("remove symlink %s: %w", w.Path, err)
			}
		}
		if err := os.WriteFile(w.Path, []byte(w.Content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", w.Path, err)
		}
	}

	if !opts.NoReload {
		// Kill waybar so waybar-watch restarts it with the new CSS.
		// style.css is a symlink to the nix store (read-only), so touching it
		// is not possible; killing waybar is the reliable reload trigger.
		_ = exec.Command("pkill", "-TERM", "waybar").Run()
		_ = exec.Command("swaync-client", "-rs").Run()
		_ = exec.Command("pkill", "-HUP", "ags").Run()
	}
	return nil
}

// applyColorsQuiet runs ApplyColors and, on error, logs to stderr and sends a
// desktop notification instead of returning the error to the caller.
func (m *Manager) applyColorsQuiet() {
	if err := m.ApplyColors(ApplyColorsOptions{}); err != nil {
		msg := "Color extraction failed: " + err.Error()
		fmt.Fprintln(m.Stderr, "orgm-wallpaper: "+msg)
		_ = exec.Command("notify-send", "-u", "normal", "orgm-wallpaper", msg).Run()
	}
}

// ColorSourceImage returns the image path to use for color extraction.
// For video wallpapers, it returns the thumbnail generated by WallpaperThumb.
// Returns an error if no wallpaper is currently set.
func (m *Manager) ColorSourceImage() (string, error) {
	mode := m.CurrentMode()
	path := m.StateValue("path")
	if path == "" {
		return "", fmt.Errorf("no wallpaper set")
	}
	if strings.Contains(mode, "video") {
		return m.WallpaperThumb(path)
	}
	return path, nil
}
