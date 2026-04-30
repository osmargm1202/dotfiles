{ pkgs, inputs, ... }:

let
  system = pkgs.stdenv.hostPlatform.system;
  dgop = inputs.dgop.packages.${system}.default;
  sddmAstronautTheme = pkgs.callPackage ../packages/sddm-astronaut-theme.nix {
    src = inputs.sddm-astronaut-theme;
  };
in
{
  imports = [
    inputs.dms.nixosModules.dank-material-shell
  ];

  services.xserver.enable = true;
  services.displayManager = {
    defaultSession = "labwc";
    sddm = {
      enable = true;
      wayland.enable = true;
      autoNumlock = true;
      theme = "sddm-astronaut-theme";
      extraPackages = with pkgs.qt6; [
        qtmultimedia
        qtsvg
        qtvirtualkeyboard
      ];
      settings.General = {
        InputMethod = "qtvirtualkeyboard";
        Numlock = "on";
      };
    };
  };

  programs.labwc.enable = true;
  programs.xwayland.enable = true;

  programs.dank-material-shell = {
    enable = true;
    systemd = {
      enable = true;
      restartIfChanged = true;
    };
    dgop.package = dgop;
    enableClipboardPaste = true;
    enableDynamicTheming = true;
    enableSystemMonitoring = true;
  };

  programs.nautilus-open-any-terminal = {
    enable = true;
    terminal = "kitty";
  };

  xdg.portal = {
    enable = true;
    wlr.enable = true;
    extraPortals = with pkgs; [
      xdg-desktop-portal-wlr
      xdg-desktop-portal-gtk
    ];
    config = {
      common.default = [
        "wlr"
        "gtk"
      ];
      wlroots.default = [
        "wlr"
        "gtk"
      ];
      labwc = {
        default = [
          "wlr"
          "gtk"
        ];
        "org.freedesktop.impl.portal.FileChooser" = [ "gtk" ];
        "org.freedesktop.impl.portal.OpenURI" = [ "gtk" ];
      };
    };
  };

  xdg.terminal-exec = {
    enable = true;
    settings = {
      labwc = [ "kitty.desktop" ];
      default = [ "kitty.desktop" ];
    };
  };

  security.polkit.enable = true;
  security.pam.services.sddm.enableGnomeKeyring = true;
  security.pam.services.login.enableGnomeKeyring = true;

  services.dbus.enable = true;
  services.gvfs.enable = true;
  services.gnome.gnome-keyring.enable = true;
  programs.dconf = {
    enable = true;
    profiles.user.databases = [
      {
        settings."org/gnome/desktop/interface" = {
          color-scheme = "prefer-dark";
          gtk-theme = "Adwaita-dark";
          icon-theme = "Adwaita";
        };
      }
    ];
  };

  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";
    MOZ_ENABLE_WAYLAND = "1";
    XDG_SESSION_TYPE = "wayland";
    XDG_SESSION_DESKTOP = "labwc";
    XDG_CURRENT_DESKTOP = "labwc:wlroots";
    QT_QPA_PLATFORM = "wayland";
    QT_QPA_PLATFORMTHEME = "gtk3";
    QT_QPA_PLATFORMTHEME_QT6 = "gtk3";
    GTK_THEME = "Adwaita:dark";
    ELECTRON_OZONE_PLATFORM_HINT = "auto";
    TERMINAL = "kitty";
  };

  environment.systemPackages = with pkgs; [
    labwc
    xwayland

    sddmAstronautTheme
    kitty
    swayidle
    swaylock
    wlopm

    mpvpaper
    mpv
    ffmpeg

    xdg-utils
    xdg-desktop-portal
    xdg-desktop-portal-wlr
    xdg-desktop-portal-gtk

    wl-clipboard
    grim
    slurp
    swappy
    wlr-randr
    wlrctl
    wtype
    brightnessctl
    pamixer
    playerctl

    nautilus

    adwaita-icon-theme
    papirus-icon-theme
    hicolor-icon-theme
    gnome-themes-extra
    gnome-tweaks
    yaru-remix-theme

    shared-mime-info
    dconf
    glib
    gnome-keyring
    polkit_gnome
  ];
}
