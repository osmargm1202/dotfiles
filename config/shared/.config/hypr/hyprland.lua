-- Hyprland 0.55 Lua config.
-- Legacy .conf files remain as fallback, but Hyprland prefers this file at startup.

require("lua.monitors")
local programs = require("lua.programs")
require("lua.autostart")
require("lua.environment")
require("lua.permissions")
require("lua.look-and-feel")
require("lua.layout")
require("lua.input")
require("lua.keybindings").setup(programs)
require("lua.windows-workspaces")
