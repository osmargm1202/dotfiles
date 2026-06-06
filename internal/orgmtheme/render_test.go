package orgmtheme

import (
	"encoding/json"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestRenderOrgmLightFixtureActiveFiles(t *testing.T) {
	themesDir := filepath.Join("..", "..", "config", "shared", ".config", "orgm-theme", "themes")
	theme, err := LoadTheme(themesDir, "orgm-light")
	if err != nil {
		t.Fatalf("LoadTheme orgm-light fixture error = %v", err)
	}
	env := Env{
		ConfigHome: "/home/test/.config",
		DataHome:   "/home/test/.local/share",
	}

	writes, err := BuildWrites(env, theme)
	if err != nil {
		t.Fatalf("BuildWrites error = %v", err)
	}
	byPath := writesByPath(writes)

	assertRenderedContains(t, byPath, "/home/test/.config/waybar/orgm-current.css", "@define-color text     #4c4f69;")
	assertRenderedContains(t, byPath, "/home/test/.config/waybar/orgm-current.css", "@define-color panel_bg rgba(239, 241, 245, 0.867);")
	assertRenderedContains(t, byPath, "/home/test/.config/gtk-4.0/gtk.css", "@define-color window_fg_color #4c4f69;")
	assertRenderedContains(t, byPath, "/home/test/.config/kitty/current-theme.conf", "background_opacity 1.0")
	assertRenderedContains(t, byPath, "/home/test/.config/hypr/scheme/current.conf", "$background = eff1f5")
	assertRenderedContains(t, byPath, "/home/test/.config/quickshell/theme/current.json", `"accent": "#1e66f5"`)
	assertRenderedContains(t, byPath, "/home/test/.config/quickshell/theme/theme.json", `"accent": "#1e66f5"`)
}

func TestRenderWaybarHyprLightIconOverrides(t *testing.T) {
	theme, err := LoadTheme(filepath.Join("..", "..", "config", "shared", ".config", "orgm-theme", "themes"), "orgm-light")
	if err != nil {
		t.Fatalf("LoadTheme orgm-light fixture error = %v", err)
	}
	env := Env{ConfigHome: "/home/test/.config", DataHome: "/home/test/.local/share"}

	writes, err := BuildWrites(env, theme)
	if err != nil {
		t.Fatalf("BuildWrites error = %v", err)
	}
	byPath := writesByPath(writes)

	assertRenderedContains(t, byPath, "/home/test/.config/waybar-hypr/orgm-current.css", `#custom-theme_toggle { background-image: url("icons/light/theme_toggle.svg"); }`)
	assertRenderedContains(t, byPath, "/home/test/.config/waybar-hypr/orgm-current.css", `background: linear-gradient(to right, #ffffff 0%, #f3f4f6 24%, #d1d5db 50%, #f3f4f6 76%, #ffffff 100%);`)
	regular := byPath["/home/test/.config/waybar/orgm-current.css"]
	if strings.Contains(regular, "icons/light/theme_toggle.svg") {
		t.Fatalf("regular Waybar palette contains Hypr icon overrides:\n%s", regular)
	}
}

func TestRenderWaybarHyprDarkUsesDeepBlueSurface(t *testing.T) {
	theme, err := LoadTheme(filepath.Join("..", "..", "config", "shared", ".config", "orgm-theme", "themes"), "orgm-dark")
	if err != nil {
		t.Fatalf("LoadTheme orgm-dark fixture error = %v", err)
	}
	env := Env{ConfigHome: "/home/test/.config", DataHome: "/home/test/.local/share"}

	writes, err := BuildWrites(env, theme)
	if err != nil {
		t.Fatalf("BuildWrites error = %v", err)
	}
	byPath := writesByPath(writes)

	assertRenderedContains(t, byPath, "/home/test/.config/waybar-hypr/orgm-current.css", `background-color: rgba(2, 10, 24, 0.78);`)
}

func TestRenderQuickshellUsesOpaqueDarkOverlay(t *testing.T) {
	theme, err := LoadTheme(filepath.Join("..", "..", "config", "shared", ".config", "orgm-theme", "themes"), "orgm-dark")
	if err != nil {
		t.Fatalf("LoadTheme orgm-dark fixture error = %v", err)
	}
	env := Env{ConfigHome: "/home/test/.config", DataHome: "/home/test/.local/share"}

	writes, err := BuildWrites(env, theme)
	if err != nil {
		t.Fatalf("BuildWrites error = %v", err)
	}
	byPath := writesByPath(writes)

	assertQuickshellOverlay(t, byPath, "/home/test/.config/quickshell/theme/current.json", "#000000")
	assertQuickshellOverlay(t, byPath, "/home/test/.config/quickshell/theme/theme.json", "#000000")
	assertRenderedContains(t, byPath, "/home/test/.config/quickshell/theme/current.json", `"border": "#33494d64"`)
	assertRenderedContains(t, byPath, "/home/test/.config/quickshell/theme/current.json", `"button": "#22363a4f"`)
}

func TestRenderQuickshellUsesOpaqueWhiteOverlay(t *testing.T) {
	theme, err := LoadTheme(filepath.Join("..", "..", "config", "shared", ".config", "orgm-theme", "themes"), "orgm-light")
	if err != nil {
		t.Fatalf("LoadTheme orgm-light fixture error = %v", err)
	}
	env := Env{ConfigHome: "/home/test/.config", DataHome: "/home/test/.local/share"}

	writes, err := BuildWrites(env, theme)
	if err != nil {
		t.Fatalf("BuildWrites error = %v", err)
	}
	byPath := writesByPath(writes)

	assertQuickshellOverlay(t, byPath, "/home/test/.config/quickshell/theme/current.json", "#eff1f5")
	assertQuickshellOverlay(t, byPath, "/home/test/.config/quickshell/theme/theme.json", "#eff1f5")
	assertRenderedContains(t, byPath, "/home/test/.config/quickshell/theme/current.json", `"button": "#e6e9efcc"`)
	assertRenderedContains(t, byPath, "/home/test/.config/quickshell/theme/current.json", `"onAccent": "#eff1f5"`)
}

func TestBuildWritesRejectsRelativeRoots(t *testing.T) {
	theme, err := LoadTheme(filepath.Join("..", "..", "config", "shared", ".config", "orgm-theme", "themes"), "orgm-light")
	if err != nil {
		t.Fatalf("LoadTheme orgm-light fixture error = %v", err)
	}
	abs := t.TempDir()

	if _, err := BuildWrites(Env{ConfigHome: "relative", DataHome: abs}, theme); err == nil {
		t.Fatal("BuildWrites succeeded with relative ConfigHome, want error")
	}
	if _, err := BuildWrites(Env{ConfigHome: abs, DataHome: "relative"}, theme); err == nil {
		t.Fatal("BuildWrites succeeded with relative DataHome, want error")
	}
}

func TestRenderActivePathsMatchBashHelper(t *testing.T) {
	theme, err := LoadTheme(filepath.Join("..", "..", "config", "shared", ".config", "orgm-theme", "themes"), "orgm-light")
	if err != nil {
		t.Fatalf("LoadTheme orgm-light fixture error = %v", err)
	}
	env := Env{ConfigHome: "/cfg", DataHome: "/data"}

	writes, err := BuildWrites(env, theme)
	if err != nil {
		t.Fatalf("BuildWrites error = %v", err)
	}
	got := make([]string, 0, len(writes))
	for _, write := range writes {
		got = append(got, write.Path)
	}
	sort.Strings(got)
	want := []string{
		"/cfg/fuzzel/fuzzel.ini",
		"/cfg/gtk-3.0/settings.ini",
		"/cfg/gtk-4.0/gtk-dark.css",
		"/cfg/gtk-4.0/gtk.css",
		"/cfg/gtk-4.0/settings.ini",
		"/cfg/hypr/scheme/current.conf",
		"/cfg/kdeglobals",
		"/cfg/kitty/current-theme.conf",
		"/cfg/nwg-dock-hyprland/orgm-current.css",
		"/cfg/qt5ct/colors/orgm-current.colors",
		"/cfg/qt5ct/qt5ct.conf",
		"/cfg/qt6ct/colors/orgm-current.colors",
		"/cfg/qt6ct/qt6ct.conf",
		"/cfg/quickshell/theme/current.json",
		"/cfg/quickshell/theme/theme.json",
		"/cfg/rofi/orgm-current.rasi",
		"/cfg/swaync/orgm-current.css",
		"/cfg/waybar-hypr/orgm-current.css",
		"/cfg/waybar/orgm-current.css",
		"/data/icons/default/index.theme",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("paths = %#v, want %#v", got, want)
	}
}

func assertRenderedContains(t *testing.T, byPath map[string]string, path, want string) {
	t.Helper()
	content, ok := byPath[path]
	if !ok {
		t.Fatalf("missing rendered path %s", path)
	}
	if !strings.Contains(content, want) {
		t.Fatalf("rendered %s does not contain %q\ncontent:\n%s", path, want, content)
	}
}

func assertQuickshellOverlay(t *testing.T, byPath map[string]string, path, expected string) {
	t.Helper()
	content, ok := byPath[path]
	if !ok {
		t.Fatalf("missing rendered path %s", path)
	}
	var parsed map[string]string
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		t.Fatalf("rendered %s is not valid json: %v", path, err)
	}
	got, ok := parsed["overlay"]
	if !ok {
		t.Fatalf("rendered %s missing overlay", path)
	}
	if got != expected {
		t.Fatalf("rendered %s overlay %q, want %q", path, got, expected)
	}
	if len(got) != 7 {
		t.Fatalf("rendered %s overlay %q has alpha or invalid length", path, got)
	}
}

func writesByPath(writes []PlannedWrite) map[string]string {
	byPath := make(map[string]string)
	for _, write := range writes {
		byPath[write.Path] = write.Content
	}
	return byPath
}
