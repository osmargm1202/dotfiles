# Edit this configuration file to define what should be installed on
# your system. Help is available in configuration.nix(5) man page
# and in NixOS manual (accessible by running ‘nixos-help’).

{ config, pkgs, lib, inputs ? null, ... }:

{
  imports =
    lib.optionals (inputs != null) [ inputs.home-manager.nixosModules.home-manager ]
    ++ lib.optionals (inputs == null) [ <home-manager/nixos> ];

  # Polkit
  security.polkit.enable = true;

  # KWallet para gestión de credenciales
  #security.pam.services.sddm.enableKwallet = true;
  #programs.gnupg.agent = {
  #  enable = true;
  #  pinentryPackage = pkgs.pinentry-curses;  # o pinentry-gtk2, pinentry-qt para GUI
  #};
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # Bootloader.
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  hardware.uinput.enable = true;

  virtualisation.podman = {
    enable = true;
    dockerCompat = true; # alias docker -> podman
    dockerSocket.enable = true;
  };

  boot.kernel.sysctl = {
    "kernel.unprivileged_userns_clone" = 1;
  };

  #virtualisation.docker.enable = true;
  hardware.nvidia-container-toolkit.enable = true;

  services.flatpak.enable = true;
  systemd.services.flatpak-repo = {
    wantedBy = [ "multi-user.target" ];
    path = [ pkgs.flatpak ];
    script = ''
      flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
      flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
    '';
  };

  programs.fish.enable = true;
  programs.git = {
    enable = true;
    config.user.name = "osmar";
    config.user.email = "osmargm1202@gmail.com";
  };

  # networking.wireless.enable = true;  # Enables wireless support via wpa_supplicant.

  # Configure network proxy if necessary
  # networking.proxy.default = "http://user:password@proxy:port/";
  # networking.proxy.noProxy = "127.0.0.1,localhost,internal.domain";

  # Enable networking
  networking.networkmanager.enable = true;

  # Set your time zone.
  time.timeZone = "America/Santo_Domingo";

  # Select internationalisation properties.
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

  # Enable CUPS to print documents.
  services.printing.enable = true;

  # Enable sound with pipewire.
  services.pulseaudio.enable = false;
  security.rtkit.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    pulse.enable = true;
    # If you want to use JACK applications, uncomment this
    #jack.enable = true;

    # use the example session manager (no others are packaged yet so this is enabled by default,
    # no need to redefine it in your config for now)
    #media-session.enable = true;
  };

  # Enable touchpad support (enabled default in most desktopManager).
  # services.xserver.libinput.enable = true;

  # Define user account. Don’t forget to set password with ‘passwd’.
  users.users.osmarg = {
    isNormalUser = true;
    description = "osmarg";
    shell = pkgs.fish;
    subUidRanges = [{ startUid = 100000; count = 65536; }];
    subGidRanges = [{ startGid = 100000; count = 65536; }];
    extraGroups = [ "networkmanager" "wheel" "docker" "osmarg" "podman" "input" ];
    packages = with pkgs; [
      # thunderbird
    ];
  };

  # programs.firefox.enable = true;

  nixpkgs.config.allowUnfree = true;

  environment.systemPackages = with pkgs; [
    wget
    vim
    fish
    curl
    nextcloud-client
    gtk3
    gsettings-desktop-schemas
    git
    distrobox
    htop
    ntfs3g
    gcc
    zoxide
    ncdu
    gnumake
    podman-compose
    nerd-fonts.jetbrains-mono
    (chromium.override { enableWideVine = true; })
  ];

  programs.dconf.enable = true;

  fonts.fontconfig.enable = true;
  environment.sessionVariables = {
    XDG_DATA_DIRS = [
      "${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}"
    ];
  };

  # Some programs need SUID wrappers, can be configured further or are
  # started in user sessions.
  # programs.mtr.enable = true;
  # programs.gnupg.agent = {
  #   enable = true;
  #   enableSSHSupport = true;
  # };

  # List services that you want to enable:

  # Enable OpenSSH daemon.
  # services.openssh.enable = true;

  # Open ports in firewall.
  # networking.firewall.allowedTCPPorts = [ ... ];
  # networking.firewall.allowedUDPPorts = [ ... ];
  #networking.firewall = {
  # enable = true;
  # allowedTCPPorts = [ 47984 47989 47990 48010 ];
  # allowedUDPPorts = [ 47998 47999 48000 48010 ];
  #};
  # Or disable firewall altogether.
  # networking.firewall.enable = false;

  system.stateVersion = "25.11"; # Did you read comment?
}
