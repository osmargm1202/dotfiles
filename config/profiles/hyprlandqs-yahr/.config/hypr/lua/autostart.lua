local exec_once = {
  "hypr-session-import-env",
  "systemctl --user start sunshine.service",
  "sh -lc 'orgm-wallpaper restore >>/tmp/orgm-wallpaper.log 2>&1'",
  "sh -lc 'orgm-wallpaper daemon >>/tmp/orgm-wallpaper.log 2>&1'",
  "mako",
  "nm-applet --indicator",
  "blueman-applet",
  "gnome-keyring-daemon --start --components=secrets,pkcs11,ssh",
  "hyprpolkitagent",
  "sh -lc 'mkdir -p ${XDG_STATE_HOME:-$HOME/.local/state}/hypr-battery-alerts && hypr-battery-alerts daemon >>${XDG_STATE_HOME:-$HOME/.local/state}/hypr-battery-alerts/helper.log 2>&1'",
  "nextcloud --background",
  "hypr-start-containers arch windows",
  "hypr-start-discord",
  "wl-paste --type text --watch cliphist store",
  "wl-paste --type image --watch cliphist store",
  "hypridle",
  "quickshell",
}

hl.on("hyprland.start", function()
  for _, cmd in ipairs(exec_once) do
    hl.exec_cmd(cmd)
  end
end)
