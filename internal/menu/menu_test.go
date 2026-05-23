package menu

import "testing"

func TestModelMainListsCompatibilityItems(t *testing.T) {
	model, ok := Model("main")
	if !ok {
		t.Fatalf("Model(main) ok = false")
	}
	got := Labels(model.Items)
	want := []string{"󰀻 Apps", "󰒓 Tools", "󱐋 Performance", "󰖩 WiFi", "󰂯 Bluetooth", "󰍉 Search", "󰌌 Keybinds", "󰒓 System", "󰑓 Reload Dock", "󰐥 Power", "󰌌 Keyboard", "󰣆 Web App Maker", "󰅖 Quit"}
	if len(got) != len(want) {
		t.Fatalf("labels len = %d (%v), want %d (%v)", len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("labels[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestPlanSelectionBuildsSubmenuAndKeyboardActions(t *testing.T) {
	tests := []struct {
		name      string
		menuName  string
		selection string
		want      ActionPlan
	}{
		{
			name:      "main tools delegates to orgm-hypr menu tools",
			menuName:  "main",
			selection: "󰒓 Tools",
			want:      ActionPlan{Command: Command{Name: "orgm-hypr", Args: []string{"menu", "tools"}}},
		},
		{
			name:      "keyboard latam switches explicit layout",
			menuName:  "keyboard",
			selection: "󰌌 Latam",
			want:      ActionPlan{Command: Command{Name: "hyprctl", Args: []string{"switchxkblayout", "all", "1"}}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := PlanSelection(tt.menuName, tt.selection)
			if !ok {
				t.Fatalf("PlanSelection(%q, %q) ok = false", tt.menuName, tt.selection)
			}
			if !plansEqual(got, tt.want) {
				t.Fatalf("PlanSelection() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestPlanSelectionMarksPowerActionsDestructive(t *testing.T) {
	got, ok := PlanSelection("power", "󰜉 Reboot")
	if !ok {
		t.Fatalf("PlanSelection(power, reboot) ok = false")
	}
	if got.Command.Name != "systemctl" || len(got.Command.Args) != 1 || got.Command.Args[0] != "reboot" {
		t.Fatalf("command = %#v, want systemctl reboot", got.Command)
	}
	if !got.Destructive || got.Confirmation != "reboot" {
		t.Fatalf("destructive = %t confirmation = %q, want destructive reboot", got.Destructive, got.Confirmation)
	}
}

func TestKeybindingEntriesFilterCategories(t *testing.T) {
	launchers := KeybindingEntries("launchers")
	if len(launchers) == 0 {
		t.Fatalf("launchers entries empty")
	}
	if launchers[0].Key != "Win+/" || launchers[0].Command != "hypr-keybindings-help" {
		t.Fatalf("first launcher entry = %#v, want Win+/ hypr-keybindings-help", launchers[0])
	}
	media := KeybindingEntries("media")
	if len(media) == 0 || media[0].Command != "volume-osd up/down" {
		t.Fatalf("media entries = %#v, want first volume-osd up/down", media)
	}
}

func plansEqual(a, b ActionPlan) bool {
	if a.Command.Name != b.Command.Name || a.Destructive != b.Destructive || a.Confirmation != b.Confirmation || len(a.Command.Args) != len(b.Command.Args) {
		return false
	}
	for i := range a.Command.Args {
		if a.Command.Args[i] != b.Command.Args[i] {
			return false
		}
	}
	return true
}
