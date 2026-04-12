{ config, pkgs, ... }:

{
  imports = [
    ../i3.nix
  ];

  services.xserver.enable = true;

  services.xserver.xkb = {
    layout = "us,latam";
    variant = "";
  };

  # Display Manager — LightDM for i3 (simple, no GNOME coupling)
  services.xserver.displayManager.lightdm = {
    enable = true;
    greeters.gtk = {
      enable = true;
      theme = {
        name = "Tokyonight-Dark-BL";
        package = pkgs.tokyonight-gtk-theme;
      };
      iconTheme = {
        name = "Papirus-Dark";
        package = pkgs.papirus-icon-theme;
      };
      cursorTheme = {
        name = "Bibata-Modern-Ice";
        package = pkgs.bibata-cursors;
        size = 24;
      };
    };
  };

  services.xserver.windowManager.i3.enable = true;

  # Bluetooth
  hardware.bluetooth = {
    enable = true;
    powerOnBoot = true;
  };
  services.blueman.enable = true;

  # GNOME Keyring for credential storage
  services.gnome.gnome-keyring.enable = true;
  programs.seahorse.enable = true;

  # Polkit authentication agent
  security.polkit.enable = true;

  # XDG portal for screen sharing, file dialogs, etc.
  xdg.portal = {
    enable = true;
    extraPortals = with pkgs; [
      xdg-desktop-portal-gtk
    ];
  };
}
