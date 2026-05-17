local programs = require("lua.programs")

local hyprchy = {}
for key, value in pairs(programs) do
  hyprchy[key] = value
end

hyprchy.menu = "~/.local/bin/hypr-launcher"
hyprchy.piPrompt = "~/.config/hypr/scripts/pi-walker-prompt.sh"

return hyprchy
