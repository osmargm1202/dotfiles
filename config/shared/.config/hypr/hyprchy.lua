-- Hyprchy profile config.
-- Same Hyprland stack as hyprland.lua, with Walker/Elephant launcher overlays only.

require("lua.monitors")
local programs = require("lua.hyprchy-programs")
require("lua.hyprchy-autostart")
require("lua.environment")
require("lua.permissions")
require("lua.look-and-feel")
require("lua.layout")
require("lua.input")
require("lua.hyprchy-keybindings").setup(programs)
require("lua.windows-workspaces")
