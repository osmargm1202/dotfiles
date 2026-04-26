{ pkgs, ... }:

{
  programs.hyprland = {
    enable = true;
    xwayland.enable = true;
  };

  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-hyprland ];
  };

  environment.systemPackages = with pkgs; [
    kitty
    waybar
    wofi
    mako
    wl-clipboard
    grim
    slurp
    hyprpaper
    hyprlock
    hypridle
    xdg-desktop-portal-hyprland
  ];
}
