local exec_once = {
  "orgm-hypr session import-env",
  "systemctl --user start graphical-session.target",
  "orgm-hypr waybar watch ~/.config/waybar-hypr",
  "swaync",
  "nm-applet --indicator",
  "blueman-applet",
  "gnome-keyring-daemon --start --components=secrets,pkcs11,ssh",
  "hyprpolkitagent",
  "orgm-hypr wallpaper restore",
  "orgm-hypr wallpaper picker-daemon",
  "nextcloud --background",
  "orgm-hypr session start-containers arch windows",
  "orgm-hypr session start-discord",
  "wl-paste --type text --watch cliphist store",
  "wl-paste --type image --watch cliphist store",
  "hypridle",
  "sh -lc 'orgm-hypr dock start 2>/tmp/hypr-nwg-dock.log'",
}

hl.on("hyprland.start", function()
  for _, cmd in ipairs(exec_once) do
    hl.exec_cmd(cmd)
  end
end)
