local env = {
  NIXOS_OZONE_WL = "1",
  MOZ_ENABLE_WAYLAND = "1",
  XDG_SESSION_TYPE = "wayland",
  XDG_SESSION_DESKTOP = "Hyprland",
  XDG_CURRENT_DESKTOP = "Hyprland",
  QT_QPA_PLATFORM = "wayland",
  QT_QPA_PLATFORMTHEME = "qt5ct",
  QT_QPA_PLATFORMTHEME_QT6 = "qt6ct",
  QT_STYLE_OVERRIDE = "kvantum",
  GTK_THEME = "catppuccin-macchiato-teal-standard",
  XCURSOR_THEME = "Catppuccin-Macchiato-Teal-Cursors",
  XCURSOR_SIZE = "36",
  HYPRCURSOR_SIZE = "36",
  ELECTRON_OZONE_PLATFORM_HINT = "auto",
  GDK_BACKEND = "wayland,x11",
  SDL_VIDEODRIVER = "wayland",
  CLUTTER_BACKEND = "wayland",
  TERMINAL = "kitty",
}

for key, value in pairs(env) do
  hl.env(key, value)
end
