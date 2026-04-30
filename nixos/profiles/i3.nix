{ pkgs, ... }:

{
  services.xserver.enable = true;
  services.xserver.windowManager.i3 = {
    enable = true;
    extraPackages = with pkgs; [ i3status ];
  };

  security.polkit.enable = true;
  services.dbus.enable = true;
  services.gvfs.enable = true;
  services.gnome.gnome-keyring.enable = true;
  programs.dconf.enable = true;

  environment.systemPackages = with pkgs; [
    i3
    i3lock-color
    polybar
    picom

    rofi
    dunst

    mpvpaper
    mpv
    ffmpeg

    kitty
    chromium
    nautilus

    networkmanagerapplet
    blueman
    pavucontrol

    polkit_gnome
    gnome-keyring
    dex
    xss-lock
    libnotify

    flameshot
    brightnessctl
    pamixer
    playerctl

    xclip
    xorg.xset
    xorg.xsetroot
    xorg.setxkbmap
  ];
}
