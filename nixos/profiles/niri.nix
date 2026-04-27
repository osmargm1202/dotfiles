{ pkgs, inputs, ... }:

let
  system = pkgs.stdenv.hostPlatform.system;
  caelestiaShell = inputs.caelestia-shell.packages.${system}.with-cli;
  sddmAstronautTheme = pkgs.callPackage ../packages/sddm-astronaut-theme.nix {
    src = inputs.sddm-astronaut-theme;
  };
in {
  services.xserver.enable = true;

  services.displayManager = {
    defaultSession = "niri";
    sddm = {
      enable = true;
      autoNumlock = true;
      theme = "sddm-astronaut-theme";
      extraPackages = with pkgs.qt6; [
        qtmultimedia
        qtsvg
        qtvirtualkeyboard
      ];
      settings.General.InputMethod = "qtvirtualkeyboard";
    };
  };

  programs.niri.enable = true;

  services.gnome.gnome-keyring.enable = true;
  security.pam.services.sddm.enableGnomeKeyring = true;
  security.pam.services.login.enableGnomeKeyring = true;

  # Portal GNOME para file picker, capturas y screencast
  xdg.portal = {
    enable = true;
    config = {
      common = {
        default = [ "gnome" ];
      };
    };
    extraPortals = with pkgs; [
      xdg-desktop-portal-gnome
      xdg-desktop-portal-gtk
    ];
  };

  xdg.mime = {
    enable = true;
    defaultApplications = {
      "inode/directory" = [ "org.gnome.Nautilus.desktop" ];
    };
  };

  # Niri usa xwayland-satellite para compat XWayland
  environment.systemPackages = with pkgs; [
    niri
    xwayland-satellite

    # Shell
    caelestiaShell
    sddmAstronautTheme
    kitty
    alacritty
    fuzzel
    waybar
    mako
    swaylock
    swayidle

    # Herramientas básicas XDG / screenshots
    xdg-utils
    wl-clipboard
    grim
    slurp
    swappy
    nautilus
    shared-mime-info

    # Keyring + portal
    gnome-keyring
    polkit_gnome

    # QoL
    gnome-software
    mpv
    ffmpeg
    mpvpaper
  ];
}
