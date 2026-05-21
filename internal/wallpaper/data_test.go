package wallpaper

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildPickerDataStatic(t *testing.T) {
	manifest := strings.NewReader(strings.Join([]string{
		"static\t/home/test/Pictures/Wallpapers/a.png",
		"video\t/home/test/Videos/wallpapers/live.mp4",
		"static\t/home/test/Pictures/Wallpapers/nested/b.jpg",
	}, "\n"))

	data, err := BuildPickerData(DataOptions{
		Mode:         "static",
		ManifestPath: "manifest.tsv",
		JSONPath:     "picker.json",
		CurrentPath:  "/home/test/Pictures/Wallpapers/a.png",
		Script:       "/home/test/.local/bin/hypr-random-wallpaper",
	}, manifest)
	if err != nil {
		t.Fatalf("BuildPickerData failed: %v", err)
	}

	if data.Mode != "static" {
		t.Fatalf("mode = %q, want static", data.Mode)
	}
	if data.Title != "Normal wallpapers" {
		t.Fatalf("title = %q", data.Title)
	}
	if data.ApplyCommand != "set-static" {
		t.Fatalf("applyCommand = %q", data.ApplyCommand)
	}
	if data.Script != "/home/test/.local/bin/hypr-random-wallpaper" {
		t.Fatalf("script = %q", data.Script)
	}
	if data.Current != "/home/test/Pictures/Wallpapers/a.png" {
		t.Fatalf("current = %q", data.Current)
	}
	if len(data.Items) != 2 {
		t.Fatalf("item count = %d, want 2", len(data.Items))
	}
	if data.Items[0].Name != "a.png" {
		t.Fatalf("first name = %q", data.Items[0].Name)
	}
	if data.Items[0].Thumb != "/home/test/Pictures/Wallpapers/.thumb/a.png.jpg" {
		t.Fatalf("first thumb = %q", data.Items[0].Thumb)
	}
	if data.Items[1].Thumb != "/home/test/Pictures/Wallpapers/nested/.thumb/b.jpg.jpg" {
		t.Fatalf("second thumb = %q", data.Items[1].Thumb)
	}
}

func TestBuildPickerDataVideo(t *testing.T) {
	manifest := strings.NewReader("static\t/x/a.png\nvideo\t/home/test/Videos/wallpapers/live.mp4\n")

	data, err := BuildPickerData(DataOptions{
		Mode:         "video",
		ManifestPath: "manifest.tsv",
		JSONPath:     "picker.json",
	}, manifest)
	if err != nil {
		t.Fatalf("BuildPickerData failed: %v", err)
	}

	if data.Title != "Live wallpapers" {
		t.Fatalf("title = %q", data.Title)
	}
	if data.ApplyCommand != "set-video" {
		t.Fatalf("applyCommand = %q", data.ApplyCommand)
	}
	if data.Script != "orgm-hypr" {
		t.Fatalf("script = %q", data.Script)
	}
	if len(data.Items) != 1 {
		t.Fatalf("item count = %d, want 1", len(data.Items))
	}
	if data.Items[0].Thumb != "/home/test/Videos/wallpapers/.thumb/live.mp4.jpg" {
		t.Fatalf("thumb = %q", data.Items[0].Thumb)
	}
}

func TestGeneratePickerDataWritesJSON(t *testing.T) {
	tmp := t.TempDir()
	manifestPath := filepath.Join(tmp, "manifest.tsv")
	jsonPath := filepath.Join(tmp, "wallpaper-picker.json")
	if err := os.WriteFile(manifestPath, []byte("static\t"+filepath.Join(tmp, "one.png")+"\n"), 0o600); err != nil {
		t.Fatalf("write manifest: %v", err)
	}

	err := GeneratePickerData(DataOptions{
		Mode:         "static",
		ManifestPath: manifestPath,
		JSONPath:     jsonPath,
		CurrentPath:  filepath.Join(tmp, "one.png"),
		Script:       "hypr-random-wallpaper",
	})
	if err != nil {
		t.Fatalf("GeneratePickerData failed: %v", err)
	}

	content, err := os.ReadFile(jsonPath)
	if err != nil {
		t.Fatalf("read json: %v", err)
	}
	var data PickerData
	if err := json.Unmarshal(content, &data); err != nil {
		t.Fatalf("json unmarshal: %v\n%s", err, content)
	}
	if data.Items[0].Thumb != filepath.Join(tmp, ".thumb", "one.png.jpg") {
		t.Fatalf("thumb = %q", data.Items[0].Thumb)
	}
	if !strings.HasSuffix(string(content), "\n") {
		t.Fatalf("json output should end with newline")
	}
}

func TestBuildPickerDataRejectsInvalidMode(t *testing.T) {
	_, err := BuildPickerData(DataOptions{Mode: "bad", ManifestPath: "manifest.tsv", JSONPath: "picker.json"}, strings.NewReader(""))
	if err == nil {
		t.Fatal("expected error")
	}
}
