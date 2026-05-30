local exec_once = {
  "orgm-hypr session import-env",
  "systemctl --user start graphical-session.target",
  "waybar-watch ~/.config/waybar-hypr",
  "swaync",
  "nm-applet --indicator",
  "blueman-applet",
  "gnome-keyring-daemon --start --components=secrets,pkcs11,ssh",
  "hyprpolkitagent",
  "orgm-hypr wallpaper restore",
  "orgm-hypr wallpaper picker-daemon",
  "sh -lc 'mkdir -p ${XDG_STATE_HOME:-$HOME/.local/state}/orgm-calendar && orgm-hypr calendar daemon >>${XDG_STATE_HOME:-$HOME/.local/state}/orgm-calendar/helper.log 2>&1'",
  "sh -lc 'mkdir -p ${XDG_STATE_HOME:-$HOME/.local/state}/hypr-battery-alerts && hypr-battery-alerts daemon >>${XDG_STATE_HOME:-$HOME/.local/state}/hypr-battery-alerts/helper.log 2>&1'",
  "nextcloud --background",
  "orgm-hypr session start-containers arch windows",
  "orgm-hypr session start-discord",
  "wl-paste --type text --watch cliphist store",
  "wl-paste --type image --watch cliphist store",
  "hypridle",
  "sh -lc 'hypr-nwg-dock 2>/tmp/hypr-nwg-dock.log'",
}

hl.on("hyprland.start", function()
  for _, cmd in ipairs(exec_once) do
    hl.exec_cmd(cmd)
  end
end)
