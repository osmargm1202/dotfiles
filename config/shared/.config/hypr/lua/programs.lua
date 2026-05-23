local programs = {
  terminal = "kitty",
  fileManager = "sh -lc 'if command -v nautilus >/dev/null 2>&1; then nautilus; elif command -v xdg-open >/dev/null 2>&1; then xdg-open .; else kitty; fi'",
  menu = "~/.local/bin/hypr-fuzzel --prompt \"Apps> \"",
  control_center = "orgm-hypr menu main",
  smart_run = "orgm-hypr smart-run run",
  lock = "~/.local/bin/hypr-lock",
  power_menu = "orgm-hypr menu power",
  display_settings = "nwg-displays",
  distrobox = "kitty -e distrobox-enter arch --",
  piPrompt = "sh -lc 'input=\"$(printf \"\" | ~/.local/bin/hypr-fuzzel --dmenu --prompt \"Pedir instrucción a Pi> \")\"; [ -z \"$input\" ] && exit 0; kitty --class kitty --hold -e distrobox-enter arch -- pi \"$input\"'",
}

return programs
