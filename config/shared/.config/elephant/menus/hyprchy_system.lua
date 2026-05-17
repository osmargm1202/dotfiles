Name = "hyprchy_system"
NamePretty = "Hyprchy System"
Icon = "preferences-system"
HideFromProviderlist = false
Description = "Hyprchy system actions"
SearchName = true

function GetEntries()
  return {
    {
      Text = "Open terminal",
      Icon = "utilities-terminal",
      Actions = { activate = "kitty" },
    },
    {
      Text = "Open file manager",
      Icon = "system-file-manager",
      Actions = { activate = "sh -lc 'nautilus 2>/dev/null || xdg-open $HOME'" },
    },
    {
      Text = "Lock screen",
      Icon = "system-lock-screen",
      Actions = { activate = "hyprlock" },
    },
    {
      Text = "Dotfiles status",
      Icon = "folder-sync",
      Actions = { activate = "kitty --class dotfiles-status -e sh -lc 'cd ~/Hobby/dotfiles && ./dot.sh status --host $(hostname); read -r -p \"press enter...\"'" },
    },
    {
      Text = "Dotfiles diff orgm",
      Icon = "document-edit",
      Actions = { activate = "kitty --class dotfiles-diff -e sh -lc 'cd ~/Hobby/dotfiles && ./dot.sh diff --host orgm; read -r -p \"press enter...\"'" },
    },
    {
      Text = "NixOS rebuild dry run",
      Icon = "nix-snowflake",
      Actions = { activate = "kitty --class nixos-dry-run -e sh -lc 'cd ~/Hobby/dotfiles && nh os test --dry --hostname $(hostname); read -r -p \"press enter...\"'" },
    },
  }
end
