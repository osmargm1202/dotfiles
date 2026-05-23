package theme

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"sort"
)

const SchemaVersion = 1

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type Registry struct {
	SchemaVersion int     `json:"schemaVersion"`
	ActiveDefault string  `json:"activeDefault"`
	Themes        []Theme `json:"themes"`
}

type Theme struct {
	ID           string                       `json:"id"`
	Name         string                       `json:"name"`
	Description  string                       `json:"description,omitempty"`
	DefaultMode  string                       `json:"defaultMode"`
	Wallpaper    Wallpaper                    `json:"wallpaper,omitempty"`
	Palettes     map[string]Palette           `json:"palettes"`
	Targets      map[string]map[string]string `json:"targets,omitempty"`
	ReloadPolicy map[string]string            `json:"reloadPolicy,omitempty"`
	SafetyPolicy map[string]string            `json:"safetyPolicy,omitempty"`
}

type Wallpaper struct {
	Mode         string `json:"mode,omitempty"`
	Path         string `json:"path,omitempty"`
	DeriveColors bool   `json:"deriveColors"`
}

type Palette struct {
	Background string `json:"background"`
	Surface    string `json:"surface"`
	SurfaceAlt string `json:"surfaceAlt"`
	Foreground string `json:"foreground"`
	Muted      string `json:"muted"`
	Accent     string `json:"accent"`
	Accent2    string `json:"accent2"`
	Border     string `json:"border"`
	Urgent     string `json:"urgent"`
	Success    string `json:"success"`
}

type Summary struct {
	ID    string
	Name  string
	Modes []string
}

func LoadRegistry(path string) (Registry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Registry{}, err
	}
	var registry Registry
	if err := json.Unmarshal(data, &registry); err != nil {
		return Registry{}, err
	}
	if err := ValidateRegistry(registry); err != nil {
		return Registry{}, err
	}
	return registry, nil
}

func ValidateRegistry(registry Registry) error {
	if registry.SchemaVersion != SchemaVersion {
		return fmt.Errorf("schemaVersion must be %d", SchemaVersion)
	}
	if registry.ActiveDefault == "" {
		return fmt.Errorf("activeDefault is required")
	}
	if len(registry.Themes) == 0 {
		return fmt.Errorf("at least one theme is required")
	}
	seen := map[string]bool{}
	activeFound := false
	for _, theme := range registry.Themes {
		if theme.ID == "" {
			return fmt.Errorf("theme id is required")
		}
		if seen[theme.ID] {
			return fmt.Errorf("duplicate theme %q", theme.ID)
		}
		seen[theme.ID] = true
		if theme.ID == registry.ActiveDefault {
			activeFound = true
		}
		if theme.Name == "" {
			return fmt.Errorf("theme %q name is required", theme.ID)
		}
		if !validMode(theme.DefaultMode) {
			return fmt.Errorf("theme %q defaultMode must be dark, light, or auto", theme.ID)
		}
		for _, mode := range []string{"dark", "light"} {
			palette, ok := theme.Palettes[mode]
			if !ok {
				return fmt.Errorf("theme %q missing required palette %q", theme.ID, mode)
			}
			if err := validatePalette(theme.ID, mode, palette); err != nil {
				return err
			}
		}
	}
	if !activeFound {
		return fmt.Errorf("activeDefault %q does not match a theme", registry.ActiveDefault)
	}
	return nil
}

func Summaries(registry Registry) []Summary {
	summaries := make([]Summary, 0, len(registry.Themes))
	for _, theme := range registry.Themes {
		modes := make([]string, 0, len(theme.Palettes))
		for mode := range theme.Palettes {
			modes = append(modes, mode)
		}
		sort.Strings(modes)
		summaries = append(summaries, Summary{ID: theme.ID, Name: theme.Name, Modes: modes})
	}
	return summaries
}

func ActiveTheme(registry Registry) (Theme, bool) {
	for _, theme := range registry.Themes {
		if theme.ID == registry.ActiveDefault {
			return theme, true
		}
	}
	return Theme{}, false
}

func validMode(mode string) bool {
	return mode == "dark" || mode == "light" || mode == "auto"
}

func validatePalette(themeID, mode string, palette Palette) error {
	colors := map[string]string{
		"background": palette.Background,
		"surface":    palette.Surface,
		"surfaceAlt": palette.SurfaceAlt,
		"foreground": palette.Foreground,
		"muted":      palette.Muted,
		"accent":     palette.Accent,
		"accent2":    palette.Accent2,
		"border":     palette.Border,
		"urgent":     palette.Urgent,
		"success":    palette.Success,
	}
	keys := []string{"background", "surface", "surfaceAlt", "foreground", "muted", "accent", "accent2", "border", "urgent", "success"}
	for _, key := range keys {
		if !hexColor.MatchString(colors[key]) {
			return fmt.Errorf("theme %q palette %q color %q must be #RRGGBB", themeID, mode, key)
		}
	}
	return nil
}
