package menu

import "strings"

type Command struct {
	Name string
	Args []string
}

type ActionPlan struct {
	Command      Command
	Destructive  bool
	Confirmation string
}

type Item struct {
	Label string
	Plan  ActionPlan
}

type ModelData struct {
	Name   string
	Prompt string
	Items  []Item
}

type KeybindingEntry struct {
	Key         string
	Description string
	Command     string
}

func Model(name string) (ModelData, bool) {
	items, ok := menuItems()[name]
	if !ok {
		return ModelData{}, false
	}
	return ModelData{Name: name, Prompt: promptFor(name), Items: items}, true
}

func Labels(items []Item) []string {
	labels := make([]string, len(items))
	for i, item := range items {
		labels[i] = item.Label
	}
	return labels
}

func PlanSelection(menuName, selection string) (ActionPlan, bool) {
	model, ok := Model(menuName)
	if !ok {
		return ActionPlan{}, false
	}
	for _, item := range model.Items {
		if item.Label == selection || strings.Contains(selection, labelText(item.Label)) {
			return item.Plan, item.Plan.Command.Name != ""
		}
	}
	return ActionPlan{}, false
}

func menuItems() map[string][]Item {
	return map[string][]Item{
		"main": {
			item("󰀻 Apps", "rofi", "-show", "drun"), item("󰒓 Tools", "orgm-hypr", "menu", "tools"), item("󱐋 Performance", "orgm-hypr", "menu", "performance"), item("󰖩 WiFi", "orgm-hypr", "menu", "wifi"), item("󰂯 Bluetooth", "orgm-hypr", "menu", "bluetooth"), item("󰍉 Search", "orgm-hypr", "smart-run", "run"), item("󰌌 Keybinds", "orgm-hypr", "menu", "keybindings"), item("󰒓 System", "orgm-hypr", "menu", "system"), item("󰑓 Reload Dock", "orgm-hypr", "dock", "start", "reload"), item("󰐥 Power", "orgm-hypr", "menu", "power"), item("󰌌 Keyboard", "orgm-hypr", "menu", "keyboard"), item("󰣆 Web App Maker", "orgm-hypr", "webapp", "create"), item("󰅖 Quit", "", ""),
		},
		"system":      {item("󰑓 Reload Hyprland", "hyprctl", "reload"), item("󰑓 Restart Waybar", "waybar", "-c", "~/.config/waybar-hypr/config", "-s", "~/.config/waybar-hypr/style.css"), item("󰑓 Reload Dock", "orgm-hypr", "dock", "start", "reload"), item("󰆍 User logs", "kitty", "--class", "user-logs", "-e", "journalctl", "--user", "-n", "200", "--no-pager"), item("󰁯 dot.sh status", "kitty", "--class", "dot-status", "-e", "sh", "-lc", "orgm-dot status --host ${HYPR_HOST:-$(hostname)}; read -r -p 'press enter...'"), item("󰕚 dot.sh diff", "kitty", "--class", "dot-diff", "-e", "sh", "-lc", "orgm-dot diff --host ${HYPR_HOST:-$(hostname)}; read -r -p 'press enter...'"), item("󰑓 dot.sh sync", "kitty", "--class", "dot-sync", "-e", "sh", "-lc", "orgm-dot sync --host ${HYPR_HOST:-$(hostname)}; read -r -p 'press enter...'"), item("󰉋 Open dotfiles", "nautilus", "~/Hobby/dotfiles"), item("󰅖 Cancel", "", "")},
		"tools":       {item("󰆍 Terminal", "kitty"), item("󰉋 Files", "nautilus"), item("󰍉 Search files", "fuzzel-open-file"), item("󰃭 Calculator", "gnome-calculator"), item("󰍹 Displays", "nwg-displays"), item("󰸉 Wallpaper next", "orgm-hypr", "wallpaper", "next"), item("󰅖 Cancel", "", "")},
		"performance": {item("󰨇 btop", "kitty", "-e", "btop"), item("󰨇 htop", "kitty", "-e", "htop"), item("󰨇 dgop", "kitty", "-e", "dgop"), item("󰍛 GNOME System Monitor", "gnome-system-monitor"), item("󰅖 Cancel", "", "")},
		"wifi":        {item("󰖩 NetworkManager GUI", "nm-connection-editor"), item("󰖩 nmtui", "kitty", "-e", "nmtui"), item("󰅖 Cancel", "", "")},
		"bluetooth":   {item("󰂯 Bluetooth GUI", "blueman-manager"), item("󰂯 bluetui", "kitty", "-e", "bluetui"), item("󰅖 Cancel", "", "")},
		"keyboard":    {item("󰌌 Toggle layout", "hyprctl", "switchxkblayout", "all", "next"), item("󰌌 US", "hyprctl", "switchxkblayout", "all", "0"), item("󰌌 Latam", "hyprctl", "switchxkblayout", "all", "1"), item("󰅖 Cancel", "", "")},
		"power":       {item("󰌾 Lock", "hypr-lock"), destructive("󰤄 Suspend", "suspend", "systemctl", "suspend"), destructive("󰒲 Hibernate", "hibernate", "systemctl", "hibernate"), destructive("󰗼 Logout", "logout", "hyprctl", "dispatch", "exit"), destructive("󰜉 Reboot", "reboot", "systemctl", "reboot"), destructive("󰐥 Power off", "poweroff", "systemctl", "poweroff"), item("󰅖 Cancel", "", "")},
	}
}

func item(label, name string, args ...string) Item {
	return Item{Label: label, Plan: ActionPlan{Command: Command{Name: name, Args: args}}}
}
func destructive(label, confirm, name string, args ...string) Item {
	return Item{Label: label, Plan: ActionPlan{Command: Command{Name: name, Args: args}, Destructive: true, Confirmation: confirm}}
}
func promptFor(name string) string {
	if name == "main" {
		return "Hyprland"
	}
	return strings.Title(name)
}
func labelText(label string) string {
	parts := strings.Fields(label)
	if len(parts) < 2 {
		return label
	}
	return strings.Join(parts[1:], " ")
}

func KeybindingEntries(category string) []KeybindingEntry {
	data := map[string][]KeybindingEntry{
		"launchers":  {{"Win+/", "Atajos Hyprland", "hypr-keybindings-help"}, {"Win+Enter", "Terminal", "kitty"}, {"Win+Space", "Menú principal", "hypr-main-menu"}, {"Win+A", "Buscar / ChatGPT", "hypr-smart-run"}},
		"tools":      {{"Win+M", "Buscar archivo", "fuzzel-open-file"}, {"Win+Esc", "Cambiar ventana", "fuzzel-hypr-window"}},
		"windows":    {{"Win+Q", "Cerrar enfocada", "killactive"}, {"Win+Shift+Q", "Cerrar por lista", "hypr-kill-windows"}},
		"workspaces": {{"Win+1..0", "Ir workspace", "workspace 1..10"}},
		"media":      {{"Vol+ / Vol-", "Volumen", "volume-osd up/down"}, {"Mute", "Silenciar audio", "volume-osd mute"}},
		"system":     {{"Win+P", "Pantallas", "nwg-displays"}, {"Win+Shift+W", "Elegir wallpaper", "orgm-hypr wallpaper pick"}},
	}
	if category == "all" || category == "" {
		var out []KeybindingEntry
		for _, key := range []string{"launchers", "tools", "windows", "workspaces", "media", "system"} {
			out = append(out, data[key]...)
		}
		return out
	}
	return data[category]
}
