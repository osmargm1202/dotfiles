{ pkgs, ... }:

{
  # Sway sin display manager: autologin en tty1 y arranque automático.
  services.xserver.enable = false;
  services.getty.autologinUser = "osmarg";

  programs.fish.loginShellInit = ''
    if test -z "$DISPLAY"; and test -z "$WAYLAND_DISPLAY"; and test (tty) = "/dev/tty1"
      exec sway
    end
  '';

  programs.sway = {
    enable = true;
    xwayland.enable = true;
    wrapperFeatures.gtk = true;
  };
  programs.xwayland.enable = true;

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
      sway = {
        default = [
          "wlr"
          "gtk"
        ];
        "org.freedesktop.impl.portal.FileChooser" = [ "gtk" ];
        "org.freedesktop.impl.portal.OpenURI" = [ "gtk" ];
        "org.freedesktop.impl.portal.ScreenCast" = [ "wlr" ];
        "org.freedesktop.impl.portal.Screenshot" = [ "wlr" ];
      };
    };
  };

  xdg.terminal-exec = {
    enable = true;
    settings = {
      sway = [ "kitty.desktop" ];
      default = [ "kitty.desktop" ];
    };
  };

  # Programas por defecto: GNOME apps + Chromium para HTML/web.
  xdg.mime = {
    enable = true;
    defaultApplications = {
      "inode/directory" = [ "org.gnome.Nautilus.desktop" ];

      # Texto / Markdown
      "text/plain" = [ "org.gnome.TextEditor.desktop" ];
      "text/markdown" = [ "org.gnome.TextEditor.desktop" ];
      "text/x-markdown" = [ "org.gnome.TextEditor.desktop" ];

      # HTML / Web
      "text/html" = [ "chromium-browser.desktop" "chromium.desktop" ];
      "application/xhtml+xml" = [ "chromium-browser.desktop" "chromium.desktop" ];
      "x-scheme-handler/http" = [ "chromium-browser.desktop" "chromium.desktop" ];
      "x-scheme-handler/https" = [ "chromium-browser.desktop" "chromium.desktop" ];

      # PDF
      "application/pdf" = [ "org.gnome.Evince.desktop" ];

      # Imágenes
      "image/png" = [ "org.gnome.Loupe.desktop" ];
      "image/jpeg" = [ "org.gnome.Loupe.desktop" ];
      "image/webp" = [ "org.gnome.Loupe.desktop" ];
      "image/gif" = [ "org.gnome.Loupe.desktop" ];
      "image/svg+xml" = [ "org.gnome.Loupe.desktop" ];

      # Videos / audio
      "video/mp4" = [ "org.gnome.Totem.desktop" "mpv.desktop" ];
      "video/x-matroska" = [ "org.gnome.Totem.desktop" "mpv.desktop" ];
      "video/webm" = [ "org.gnome.Totem.desktop" "mpv.desktop" ];
      "audio/mpeg" = [ "org.gnome.Totem.desktop" "mpv.desktop" ];
      "audio/flac" = [ "org.gnome.Totem.desktop" "mpv.desktop" ];
      "audio/ogg" = [ "org.gnome.Totem.desktop" "mpv.desktop" ];

      # Comprimidos
      "application/zip" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-tar" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-7z-compressed" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-rar" = [ "org.gnome.FileRoller.desktop" ];
    };
  };

  security.polkit.enable = true;
  security.pam.services.login.enableGnomeKeyring = true;

  services.dbus.enable = true;
  services.gvfs.enable = true;
  services.gnome.gnome-keyring.enable = true;
  programs.dconf.enable = true;

  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";
    MOZ_ENABLE_WAYLAND = "1";
    XDG_SESSION_TYPE = "wayland";
    XDG_SESSION_DESKTOP = "sway";
    XDG_CURRENT_DESKTOP = "sway:wlroots";
    QT_QPA_PLATFORM = "wayland";
    QT_QPA_PLATFORMTHEME = "gtk3";
    QT_QPA_PLATFORMTHEME_QT6 = "gtk3";
    GTK_THEME = "Adwaita:dark";
    ELECTRON_OZONE_PLATFORM_HINT = "auto";
    GDK_BACKEND = "wayland,x11";
    SDL_VIDEODRIVER = "wayland";
    CLUTTER_BACKEND = "wayland";
    TERMINAL = "kitty";
  };

  environment.systemPackages = with pkgs; [
    sway
    xwayland

    # Shell Sway
    waybar
    swaybg
    swayidle
    swaylock
    swaynotificationcenter
    wlogout
    fuzzel
    kitty

    # Portal / XDG
    xdg-utils
    xdg-desktop-portal
    xdg-desktop-portal-wlr
    xdg-desktop-portal-gtk

    # Clipboard / screenshots / wlroots tools
    wl-clipboard
    cliphist
    grim
    slurp
    swappy
    wlr-randr
    wlrctl
    wtype
    wlopm

    # Hardware controls
    brightnessctl
    pamixer
    playerctl
    pavucontrol
    networkmanagerapplet
    blueman
    wdisplays

    # GNOME apps usados como defaults
    nautilus
    gnome-text-editor
    apostrophe
    loupe
    evince
    totem
    mpv
    file-roller
    baobab
    gnome-calculator
    gnome-disk-utility
    gnome-logs
    seahorse
    gnome-font-viewer
    gnome-characters
    sushi

    # Desktop integration / theming
    gsettings-desktop-schemas
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
