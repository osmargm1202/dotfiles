local programs = {
  terminal = "kitty",
  fileManager = "sh -lc 'if command -v nautilus >/dev/null 2>&1; then nautilus --new-window; elif command -v xdg-open >/dev/null 2>&1; then xdg-open .; else kitty; fi'",
  menu = "orgm-hypr launcher apps",
  control_center = "orgm-hypr menu main",
  smart_run = "orgm-hypr smart-run run",
  lock = "orgm-hypr session lock --force",
  power_menu = "orgm-hypr menu power",
  display_settings = "nwg-displays",
  distrobox = "kitty -e distrobox-enter arch --",
  piPrompt = "orgm-hypr pi prompt --launcher fuzzel",
}

return programs
