# Edit this configuration file to define what should be installed on
# your system.  Help is available in the configuration.nix(5) man page
# and in the NixOS manual (accessible by running 'nixos-help').

{ config, pkgs, ... }:

{
  imports =
    [ # Include the results of the hardware scan.
      ./hardware-configuration.nix
    ];

    nix.settings.experimental-features = [ "nix-command" "flakes" ];

    virtualisation.containers.enable = true;

    virtualisation.containers.registries.insecure = {
      "orgmcr.or-gm.coms"
    }

    virtualisation.podman = {
      enable = true;
      dockerCompact = true;
    }

  # Bootloader.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Hostname
  networking.hostName = "orgm";
  networking.networkmanager.enable = true;

  # Timezone y locale
  time.timeZone = "America/Santo_Domingo";
  i18n.defaultLocale = "en_US.UTF-8";
  i18n.extraLocaleSettings = {
    LC_ADDRESS = "es_DO.UTF-8";
    LC_IDENTIFICATION = "es_DO.UTF-8";
    LC_MEASUREMENT = "es_DO.UTF-8";
    LC_MONETARY = "es_DO.UTF-8";
    LC_NAME = "es_DO.UTF-8";
    LC_NUMERIC = "es_DO.UTF-8";
    LC_PAPER = "es_DO.UTF-8";
    LC_TELEPHONE = "es_DO.UTF-8";
    LC_TIME = "es_DO.UTF-8";
  };

  # X11 y i3
  services.xserver = {
    enable = true;
    
    # i3 como window manager
    windowManager.i3 = {
      enable = true;
      extraPackages = with pkgs; [
        dmenu
        i3status
        i3lock
        i3blocks
      ];
    };
    
    # Display Manager
    displayManager = {
      lightdm.enable = true;
      defaultSession = "none+i3";
    };
    
    # Keyboard layout
    xkb = {
      layout = "us,latam";
      variant = "";
    };
  };

  # Audio con pipewire
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
  };

  # Impresoras
  services.printing.enable = true;
  services.avahi = {
    enable = true;
    nssmdns4 = true;
    openFirewall = true;
  };

  # Flatpak
  services.flatpak.enable = true;
  systemd.services.flatpak-repo = {
    wantedBy = [ "multi-user.target" ];
    path = [ pkgs.flatpak ];
    script = ''
      flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
      flatpak remote-add --if-not-exists flathub https://nightly.gnome.org/gnome-nightly.flatpakrepo
      flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo   
    '';
  };
  
  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-gtk ];
    config.common.default = "*";
  };

  # Polkit (necesario para permisos de GUI)
  security.polkit.enable = true;

  # GNOME Keyring (gestión de contraseñas)
  services.gnome.gnome-keyring.enable = true;
  security.pam.services.lightdm.enableGnomeKeyring = true;

  # Udisks2 (montaje automático de USBs)
  services.udisks2.enable = true;

  # Touchpad support
  services.libinput.enable = true;

  # Fish shell
  programs.fish.enable = true;
  programs.git.enable = true;

  # Usuario
  users.users.osmarg = {
    isNormalUser = true;
    description = "osmarg";
    shell = pkgs.fish;
    extraGroups = [ "networkmanager" "wheel" ];
  };

  # Permitir paquetes unfree
  nixpkgs.config.allowUnfree = true;

  # Paquetes del sistema
  environment.systemPackages = with pkgs; [
    # === BASE ===
    wget
    curl
    rsync
    git
    gh
    vim
    neovim
    nano
    htop
    ncdu
    
    # === SHELL Y CLI TOOLS ===
    fish
    starship
    eza
    duf
    zoxide
    fzf
    ripgrep
    fd
    bat
    jq
    
    # === I3 Y WM ===
    i3
    i3status
    i3lock
    i3blocks
    polybar
    rofi
    dunst
    picom  # compositor para transparencias y efectos
    
    # === UTILIDADES DE ESCRITORIO ===
    xclip
    clipmenu
    flameshot
    brightnessctl
    scrot
    udiskie
    arandr
    autorandr
    xorg.xrandr
    xorg.xinput
    xorg.xsetroot
    nitrogen  # alternativa a xwallpaper
    
    # === THEMING ===
    pywal
    lxappearance  # para configurar temas GTK
    libsForQt5.qt5ct  # para configurar temas Qt
    kdePackages.qt6ct
    # === NETWORK ===
    networkmanagerapplet  # nm-applet para systray
    
    # === FONTS ===
    noto-fonts
    roboto
    liberation_ttf
    nerd-fonts.jetbrains-mono
    
    # === APLICACIONES GUI ===
    kitty  # terminal
    chromium
    eog  # Eye of GNOME (visor de imágenes)
    evince  # Document Viewer de GNOME
    vlc
    simple-scan  # escáner de GNOME
    kdePackages.dolphin  # gestor de archivos (opcional)
    kdePackages.kate

    # === DEVELOPMENT ===
    distrobox
    podman
    python3
    
    # === POLKIT AGENT (IMPORTANTE) ===
    polkit_gnome  # agente de polkit para i3
    
    # === FILE MANAGER CLI ===
    nnn
    ranger
  ];

  # Variables de entorno para Qt
  environment.sessionVariables = {
    QT_QPA_PLATFORMTHEME = "qt5ct";
  };

  # Iniciar polkit agent automáticamente
  systemd.user.services.polkit-gnome-authentication-agent-1 = {
    description = "polkit-gnome-authentication-agent-1";
    wantedBy = [ "graphical-session.target" ];
    wants = [ "graphical-session.target" ];
    after = [ "graphical-session.target" ];
    serviceConfig = {
      Type = "simple";
      ExecStart = "${pkgs.polkit_gnome}/libexec/polkit-gnome-authentication-agent-1";
      Restart = "on-failure";
      RestartSec = 1;
      TimeoutStopSec = 10;
    };
  };

  system.stateVersion = "25.11";
}
