local programs = require("lua.programs")

local hyprchy = {}
for key, value in pairs(programs) do
  hyprchy[key] = value
end

hyprchy.menu = "fuzzel --prompt 'Apps> '"
hyprchy.control_center = "~/.local/bin/hyprchy-control-center"
hyprchy.smart_run = "~/.local/bin/hyprchy-smart-run"
hyprchy.power_menu = "~/.local/bin/hyprchy-power-menu"
hyprchy.wallpaper_menu = "~/.local/bin/hyprchy-wallpaper-menu"
hyprchy.theme_menu = "~/.local/bin/hyprchy-theme-menu"
hyprchy.panel_restart = "sh -lc 'hyprpanel -q; hyprpanel'"
hyprchy.panel_stop = "hyprpanel -q"

return hyprchy
