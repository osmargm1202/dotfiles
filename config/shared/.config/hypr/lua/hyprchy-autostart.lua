local exec_once = {
  "systemctl --user import-environment WAYLAND_DISPLAY DISPLAY XDG_SESSION_TYPE XDG_SESSION_DESKTOP XDG_CURRENT_DESKTOP QT_QPA_PLATFORM QT_QPA_PLATFORMTHEME QT_QPA_PLATFORMTHEME_QT6 ELECTRON_OZONE_PLATFORM_HINT MOZ_ENABLE_WAYLAND NIXOS_OZONE_WL TERMINAL XCURSOR_THEME XCURSOR_SIZE HYPRCHY",
  "dbus-update-activation-environment --systemd WAYLAND_DISPLAY DISPLAY XDG_SESSION_TYPE XDG_SESSION_DESKTOP XDG_CURRENT_DESKTOP QT_QPA_PLATFORM QT_QPA_PLATFORMTHEME QT_QPA_PLATFORMTHEME_QT6 ELECTRON_OZONE_PLATFORM_HINT MOZ_ENABLE_WAYLAND NIXOS_OZONE_WL TERMINAL XCURSOR_THEME XCURSOR_SIZE HYPRCHY",
  "sh -lc 'systemctl --user start hyprchy-elephant.service && sleep 2 && systemctl --user start hyprchy-walker.service'",
  "~/.local/bin/waybar-watch ~/.config/waybar-hyprchy",
  "swaync",
  "nm-applet --indicator",
  "blueman-applet",
  "gnome-keyring-daemon --start --components=secrets,pkcs11,ssh",
  "hyprpolkitagent",
  "sh -lc '$HOME/.local/bin/hypr-random-wallpaper daemon'",
  "nextcloud --background",
  "sh -lc 'if command -v docker >/dev/null 2>&1; then docker start arch windows >/dev/null 2>&1 || true; elif command -v podman >/dev/null 2>&1; then podman start arch windows >/dev/null 2>&1 || true; fi'",
  "sh -lc 'if command -v discord >/dev/null 2>&1; then discord --start-minimized; elif command -v flatpak >/dev/null 2>&1 && flatpak info com.discordapp.Discord >/dev/null 2>&1; then flatpak run com.discordapp.Discord --start-minimized; fi'",
  "wl-paste --type text --watch cliphist store",
  "wl-paste --type image --watch cliphist store",
  "hypridle",
}

hl.on("hyprland.start", function()
  for _, cmd in ipairs(exec_once) do
    hl.exec_cmd(cmd)
  end
end)
