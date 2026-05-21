package wallpaper

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/osmarg/dotfiles/orgm-hypr/internal/paths"
)

// PickerItem is one wallpaper entry consumed by Quickshell.
type PickerItem struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Thumb string `json:"thumb"`
}

// PickerData is the JSON schema consumed by the resident Quickshell picker.
type PickerData struct {
	Mode         string       `json:"mode"`
	Title        string       `json:"title"`
	ApplyCommand string       `json:"applyCommand"`
	Script       string       `json:"script"`
	Current      string       `json:"current"`
	Items        []PickerItem `json:"items"`
}

// DataOptions configures Quickshell picker JSON generation.
type DataOptions struct {
	Mode         string
	ManifestPath string
	JSONPath     string
	CurrentPath  string
	Script       string
}

func (o DataOptions) validate() error {
	switch o.Mode {
	case "static", "video":
	default:
		return fmt.Errorf("mode must be static or video")
	}
	if o.ManifestPath == "" {
		return fmt.Errorf("manifest path is required")
	}
	if o.JSONPath == "" {
		return fmt.Errorf("json path is required")
	}
	return nil
}

// GeneratePickerData reads a TSV manifest and writes Quickshell picker JSON.
// Manifest rows are `<mode>\t<absolute path>`, matching hypr-random-wallpaper.
func GeneratePickerData(opts DataOptions) error {
	if err := opts.validate(); err != nil {
		return err
	}

	manifest, err := os.Open(opts.ManifestPath)
	if err != nil {
		return err
	}
	defer manifest.Close()

	data, err := BuildPickerData(opts, manifest)
	if err != nil {
		return err
	}

	output, err := os.Create(opts.JSONPath)
	if err != nil {
		return err
	}
	defer output.Close()

	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(data); err != nil {
		return err
	}
	return output.Close()
}

// BuildPickerData converts a manifest reader into the Quickshell schema.
func BuildPickerData(opts DataOptions, manifest io.Reader) (PickerData, error) {
	if err := opts.validate(); err != nil {
		return PickerData{}, err
	}

	data := PickerData{
		Mode:         opts.Mode,
		Title:        titleForMode(opts.Mode),
		ApplyCommand: applyCommandForMode(opts.Mode),
		Script:       opts.Script,
		Current:      opts.CurrentPath,
		Items:        []PickerItem{},
	}
	if data.Script == "" {
		data.Script = "orgm-hypr"
	}

	scanner := bufio.NewScanner(manifest)
	for scanner.Scan() {
		line := strings.TrimSuffix(scanner.Text(), "\n")
		if line == "" {
			continue
		}
		rowMode, wallpaperPath, ok := strings.Cut(line, "\t")
		if !ok {
			return PickerData{}, fmt.Errorf("invalid manifest row: %q", line)
		}
		if rowMode != opts.Mode {
			continue
		}
		data.Items = append(data.Items, PickerItem{
			Name:  filepath.Base(wallpaperPath),
			Path:  wallpaperPath,
			Thumb: paths.ThumbPath(wallpaperPath),
		})
	}
	if err := scanner.Err(); err != nil {
		return PickerData{}, err
	}

	return data, nil
}

func titleForMode(mode string) string {
	if mode == "video" {
		return "Live wallpapers"
	}
	return "Normal wallpapers"
}

func applyCommandForMode(mode string) string {
	if mode == "video" {
		return "set-video"
	}
	return "set-static"
}
