{ pkgs, lib, inputs, ... }:

let
  system = pkgs.stdenv.hostPlatform.system;
  noctaliaShell = inputs.noctalia.packages.${system}.default;
  sddmAstronautTheme = pkgs.callPackage ../packages/sddm-astronaut-theme.nix {
    src = inputs.sddm-astronaut-theme;
  };
in {
  services.xserver.enable = true;
  # KWallet para gestión de credenciales
  security.pam.services.sddm.enableKwallet = true;
  #programs.gnupg.agent = {
  #  enable = true;
  #  pinentryPackage = pkgs.pinentry-curses;  # o pinentry-gtk2, pinentry-qt para GUI
  #};
  services.displayManager = {
    defaultSession = "hyprland";
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

  programs.hyprland = {
    enable = true;
    xwayland.enable = true;
  };

  systemd.services.flatpak-repo.script = ''
    flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
    flatpak remote-add --if-not-exists flathub https://nightly.gnome.org/gnome-nightly.flatpakrepo
    flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  '';

  environment.etc."xdg/hypr/hyprland.conf".text = lib.mkDefault ''
    exec-once = ${lib.getExe noctaliaShell}
  '';

  environment.systemPackages = with pkgs; [
    kitty
    wl-clipboard
    grim
    gnome-software
    slurp
    swappy
    noctaliaShell
    sddmAstronautTheme
    inputs.snappy-switcher.packages.${pkgs.system}.default
    rofi

    # Iconos KDE
    kdePackages.breeze-icons
    
    # Live Wallpaper
    mpvpaper
    mpv
    ffmpeg
    # Temas Qt
    libsForQt5.qtstyleplugin-kvantum
    kdePackages.qtstyleplugin-kvantum
    qt6Packages.qt6ct
    libsForQt5.qt5ct
    # Integración KDE / archivos / protocolos / thumbnails
    

    kdePackages.kde-cli-tools
    kdePackages.dolphin
    kdePackages.kio
    kdePackages.kio-extras
    kdePackages.qtwayland
    kdePackages.kwallet
    kdePackages.konsole
    # Utilidades XDG
    xdg-utils
    shared-mime-info

    # Opcionales útiles
    kdePackages.ark          # compresor zip/rar/etc
    kdePackages.okular       # PDF
    kdePackages.gwenview     # imágenes
    kdePackages.kate         # editor

    # explorador de gnome
    #nautilus
    #xdg-utils
    #shared-mime-info
  ];
  # explorador de gnome 
  #services.gvfs.enable = true;
  #
  xdg.mime = {
    enable = true;
    defaultApplications = {
      "inode/directory" = [ "org.kde.dolphin.desktop" ];
    };
  };

  xdg.portal = {
    enable = true;
    extraPortals = with pkgs; [
      xdg-desktop-portal-hyprland
      xdg-desktop-portal-gtk
      kdePackages.xdg-desktop-portal-kde
    ];
  };
}
