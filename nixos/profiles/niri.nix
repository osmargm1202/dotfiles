{ pkgs, inputs, ... }:

let
  sddmAstronautTheme = pkgs.callPackage ../packages/sddm-astronaut-theme.nix {
    src = inputs.sddm-astronaut-theme;
  };
in {
  imports = [
    inputs.dms.nixosModules.dank-material-shell
  ];

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

  programs.dank-material-shell = {
    enable = true;
    systemd = {
      enable = true;
      restartIfChanged = true;
    };
    enableClipboardPaste = true;
    enableDynamicTheming = true;
    enableSystemMonitoring = false;
  };

  programs.nautilus-open-any-terminal = {
    enable = true;
    terminal = "kitty";
  };

  services.gnome.gnome-keyring.enable = true;
  security.pam.services.sddm.enableGnomeKeyring = true;
  security.pam.services.login.enableGnomeKeyring = true;

  # Portal GNOME para capturas/screencast; GTK para selector de archivos en Niri.
  xdg.portal = {
    enable = true;
    config = {
      common = {
        default = [ "gnome" "gtk" ];
      };
      niri = {
        "org.freedesktop.impl.portal.FileChooser" = [ "gtk" ];
      };
    };
    extraPortals = with pkgs; [
      xdg-desktop-portal-gnome
      xdg-desktop-portal-gtk
    ];
  };

  xdg.terminal-exec = {
    enable = true;
    settings = {
      niri = [ "kitty.desktop" ];
      default = [ "kitty.desktop" ];
    };
  };

  xdg.mime = {
    enable = true;
    defaultApplications = {
      "inode/directory" = [ "org.gnome.Nautilus.desktop" ];
      "text/plain" = [ "org.gnome.TextEditor.desktop" ];
      "text/markdown" = [ "org.gnome.TextEditor.desktop" ];
      "application/pdf" = [ "org.gnome.Evince.desktop" ];
      "image/png" = [ "org.gnome.Loupe.desktop" ];
      "image/jpeg" = [ "org.gnome.Loupe.desktop" ];
      "image/webp" = [ "org.gnome.Loupe.desktop" ];
      "image/gif" = [ "org.gnome.Loupe.desktop" ];
      "application/zip" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-tar" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-7z-compressed" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-rar" = [ "org.gnome.FileRoller.desktop" ];
    };
  };

  # Niri usa xwayland-satellite para compat XWayland
  environment.systemPackages = with pkgs; [
    niri
    xwayland-satellite

    # Shell
    sddmAstronautTheme
    kitty
    alacritty
    fuzzel
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
    gnome-text-editor
    gnome-calculator
    evince
    loupe
    file-roller
    gnome-disk-utility
    sushi
    baobab
    adwaita-icon-theme
    papirus-icon-theme
    hicolor-icon-theme
    gnome-themes-extra
    gnome-tweaks
    yaru-remix-theme
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
