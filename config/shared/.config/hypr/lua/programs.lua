local programs = {
  terminal = "kitty",
  fileManager = "sh -lc 'if command -v nautilus >/dev/null 2>&1; then nautilus; elif command -v xdg-open >/dev/null 2>&1; then xdg-open .; else kitty; fi'",
  menu = "~/.local/bin/hypr-fuzzel --prompt \"Apps> \"",
  control_center = "~/.local/bin/hypr-main-menu",
  smart_run = "~/.local/bin/hypr-smart-run",
  lock = "~/.local/bin/hypr-lock",
  power_menu = "~/.local/bin/hypr-power-menu",
  display_settings = "nwg-displays",
  distrobox = "kitty -e distrobox-enter arch --",
  piPrompt = "sh -lc 'input=\"$(printf \"\" | ~/.local/bin/hypr-fuzzel --dmenu --prompt \"Pedir instrucción a Pi> \")\"; [ -z \"$input\" ] && exit 0; kitty --class kitty --hold -e distrobox-enter arch -- pi \"$input\"'",
}

return programs
