local M = {}

local function dispatch(cmd)
  return hl.dsp.exec_cmd("hyprctl dispatch " .. cmd)
end

function M.setup(programs)
  local mainMod = "SUPER"

  -- Help / launchers.
  hl.bind(mainMod .. " + slash", hl.dsp.exec_cmd("~/.local/bin/hypr-keybindings-help"))
  hl.bind(mainMod .. " + CTRL + slash", hl.dsp.exec_cmd("kitty --hold -e distrobox-enter arch -- tmuxls"))
  hl.bind(mainMod .. " + Return", hl.dsp.exec_cmd(programs.terminal))
  hl.bind(mainMod .. " + SHIFT + Return", hl.dsp.exec_cmd("kitty -e distrobox-enter arch"))
  hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(programs.fileManager))
  hl.bind(mainMod .. " + W", hl.dsp.exec_cmd("flatpak run app.zen_browser.zen"))
  hl.bind(mainMod .. " + A", hl.dsp.exec_cmd("kitty --class orgmai-chat -e distrobox-enter arch -- orgmai chat"))
  hl.bind(mainMod .. " + SHIFT + A", hl.dsp.exec_cmd("kitty --class orgmai-chat -e distrobox-enter arch -- orgmai prev"))
  hl.bind(mainMod .. " + SHIFT + R", hl.dsp.exec_cmd("kitty -e distrobox-enter arch -- orgmrnc find"))
  hl.bind(mainMod .. " + SHIFT + P", hl.dsp.exec_cmd(programs.piPrompt))

  -- Hyprchy v2 launchers and control center.
  hl.bind(mainMod .. " + Space", hl.dsp.exec_cmd(programs.menu))
  hl.bind(mainMod .. " + R", hl.dsp.exec_cmd(programs.smart_run))
  hl.bind(mainMod .. " + ALT + Space", hl.dsp.exec_cmd(programs.control_center))
  hl.bind(mainMod .. " + ALT + W", hl.dsp.exec_cmd(programs.wallpaper_menu))
  hl.bind(mainMod .. " + ALT + T", hl.dsp.exec_cmd(programs.theme_menu))
  hl.bind(mainMod .. " + SHIFT + Q", hl.dsp.exec_cmd(programs.power_menu))

  -- Current fuzzel helper stack.
  hl.bind(mainMod .. " + M", hl.dsp.exec_cmd("~/.local/bin/fuzzel-open-file"))
  hl.bind(mainMod .. " + CTRL + M", hl.dsp.exec_cmd("~/.local/bin/fuzzel-open-file-dir"))
  hl.bind(mainMod .. " + SHIFT + M", hl.dsp.exec_cmd("~/.local/bin/fuzzel-open-file-terminal"))
  hl.bind(mainMod .. " + Escape", hl.dsp.exec_cmd("~/.local/bin/fuzzel-hypr-window"))
  hl.bind(mainMod .. " + SHIFT + T", hl.dsp.exec_cmd("~/.local/bin/fuzzel-tmux-arch"))
  hl.bind(mainMod .. " + C", hl.dsp.exec_cmd("~/.local/bin/fuzzel-calc"))
  hl.bind(mainMod .. " + D", hl.dsp.exec_cmd("~/.local/bin/fuzzel-ssh-host"))
  hl.bind(mainMod .. " + P", hl.dsp.exec_cmd(programs.display_settings))
  hl.bind(mainMod .. " + CTRL + comma", hl.dsp.exec_cmd(programs.display_settings))
  hl.bind(mainMod .. " + ALT + E", hl.dsp.exec_cmd(programs.power_menu))
  hl.bind(mainMod .. " + ALT + L", hl.dsp.exec_cmd(programs.lock))
  hl.bind(mainMod .. " + N", hl.dsp.exec_cmd("swaync-client -t -sw"))
  hl.bind(mainMod .. " + CTRL + SHIFT + M", hl.dsp.exec_cmd("swaync-client -C"))
  hl.bind(mainMod .. " + SHIFT + W", hl.dsp.exec_cmd("~/.local/bin/hypr-random-wallpaper next"))
  hl.bind(mainMod .. " + V", hl.dsp.exec_cmd("sh -lc 'cliphist list | fuzzel --dmenu --prompt \"Clipboard> \" | cliphist decode | wl-copy'"))
  hl.bind(mainMod .. " + F10", hl.dsp.exec_cmd("pavucontrol"))
  hl.bind("CTRL + Space", hl.dsp.exec_cmd("hyprctl switchxkblayout all next"))

  -- Scratchpad equivalent: special workspace.
  hl.bind(mainMod .. " + S", hl.dsp.workspace.toggle_special("magic"))
  hl.bind(mainMod .. " + SHIFT + S", dispatch("movetoworkspacesilent special:magic"))
  hl.bind(mainMod .. " + CTRL + S", hl.dsp.window.move({ workspace = "current" }))

  -- Media keys.
  hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("~/.local/bin/volume-osd up"), { repeating = true, locked = true })
  hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("~/.local/bin/volume-osd down"), { repeating = true, locked = true })
  hl.bind("XF86AudioMute", hl.dsp.exec_cmd("~/.local/bin/volume-osd mute"), { locked = true })
  hl.bind(mainMod .. " + XF86AudioRaiseVolume", hl.dsp.exec_cmd("~/.local/bin/mic-volume-osd up"), { repeating = true })
  hl.bind(mainMod .. " + XF86AudioLowerVolume", hl.dsp.exec_cmd("~/.local/bin/mic-volume-osd down"), { repeating = true })
  hl.bind("XF86AudioMicMute", hl.dsp.exec_cmd("~/.local/bin/mic-volume-osd mute"), { locked = true })
  hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
  hl.bind("XF86AudioStop", hl.dsp.exec_cmd("playerctl stop"), { locked = true })
  hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"), { locked = true })
  hl.bind("XF86AudioNext", hl.dsp.exec_cmd("playerctl next"), { locked = true })
  hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("~/.local/bin/brightness-osd up"), { repeating = true, locked = true })
  hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("~/.local/bin/brightness-osd down"), { repeating = true, locked = true })
  hl.bind("Print", hl.dsp.exec_cmd('grim -g "$(slurp)" - | swappy -f -'))
  hl.bind("CTRL + Print", hl.dsp.exec_cmd("grim - | swappy -f -"))
  hl.bind("ALT + Print", hl.dsp.exec_cmd('grim -g "$(slurp)" - | swappy -f -'))
  hl.bind(mainMod .. " + Print", hl.dsp.exec_cmd("fish -c record_screen_mp4"))
  hl.bind(mainMod .. " + SHIFT + Print", hl.dsp.exec_cmd("fish -c record_screen_gif"))

  -- Window/session controls.
  hl.bind(mainMod .. " + Tab", dispatch("focuscurrentorlast"))
  hl.bind(mainMod .. " + Q", hl.dsp.window.close())
  hl.bind(mainMod .. " + SHIFT + E", hl.dsp.exit())
  hl.bind("CTRL + ALT + Delete", hl.dsp.exit())
  hl.bind(mainMod .. " + F", hl.dsp.window.fullscreen({ mode = 1 }))
  hl.bind(mainMod .. " + SHIFT + F", hl.dsp.window.fullscreen({ mode = 0 }))
  hl.bind(mainMod .. " + SHIFT + Space", hl.dsp.window.float({ action = "toggle" }))
  hl.bind(mainMod .. " + T", hl.dsp.layout("togglesplit"))
  hl.bind(mainMod .. " + C", hl.dsp.window.center())
  hl.bind(mainMod .. " + CTRL + R", hl.dsp.layout("togglesplit"))
  hl.bind(mainMod .. " + minus", dispatch("resizeactive -20 0"))
  hl.bind(mainMod .. " + equal", dispatch("resizeactive 20 0"))
  hl.bind(mainMod .. " + SHIFT + minus", dispatch("resizeactive 0 -20"))
  hl.bind(mainMod .. " + SHIFT + equal", dispatch("resizeactive 0 20"))

  -- Focus / move.
  local dirs = { left = "left", down = "down", up = "up", right = "right", h = "left", j = "down", k = "up", l = "right" }
  local moveDirs = { left = "l", down = "d", up = "u", right = "r", h = "l", j = "d", k = "u", l = "r" }
  for key, dir in pairs(dirs) do
    hl.bind(mainMod .. " + " .. key, hl.dsp.focus({ direction = dir }))
  end
  for key, dir in pairs(moveDirs) do
    hl.bind(mainMod .. " + CTRL + " .. key, hl.dsp.window.move({ direction = dir }))
  end

  -- Workspaces.
  hl.bind(mainMod .. " + Home", hl.dsp.focus({ workspace = 1 }))
  hl.bind(mainMod .. " + End", hl.dsp.focus({ workspace = 10 }))
  hl.bind(mainMod .. " + CTRL + Home", hl.dsp.window.move({ workspace = 1 }))
  hl.bind(mainMod .. " + CTRL + End", hl.dsp.window.move({ workspace = 10 }))
  hl.bind(mainMod .. " + Page_Down", hl.dsp.focus({ workspace = "r-1" }))
  hl.bind(mainMod .. " + Page_Up", hl.dsp.focus({ workspace = "r+1" }))
  hl.bind(mainMod .. " + U", hl.dsp.focus({ workspace = "r-1" }))
  hl.bind(mainMod .. " + I", hl.dsp.focus({ workspace = "r+1" }))
  hl.bind(mainMod .. " + CTRL + Page_Down", hl.dsp.window.move({ workspace = "r-1" }))
  hl.bind(mainMod .. " + CTRL + Page_Up", hl.dsp.window.move({ workspace = "r+1" }))
  hl.bind(mainMod .. " + CTRL + U", hl.dsp.window.move({ workspace = "r-1" }))
  hl.bind(mainMod .. " + CTRL + I", hl.dsp.window.move({ workspace = "r+1" }))

  for i = 1, 10 do
    local key = i % 10
    hl.bind(mainMod .. " + " .. key, hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
  end

  -- Mouse.
  hl.bind(mainMod .. " + mouse:272", hl.dsp.window.drag(), { mouse = true })
  hl.bind(mainMod .. " + mouse:273", hl.dsp.window.resize(), { mouse = true })
end

return M
