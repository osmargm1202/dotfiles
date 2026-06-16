package wallpaper

import (
	"encoding/json"
	"fmt"
	"os/exec"
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
