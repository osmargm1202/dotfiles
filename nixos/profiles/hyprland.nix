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
  #security.pam.services.sddm.enableKwallet = true;
  #programs.gnupg.agent = {
  #  enable = true;
  #  pinentryPackage = pkgs.pinentry-curses;  # o pinentry-gtk2, pinentry-qt para GUI
  #};
  services.displayManager = {
    defaultSession = "hyprland";
    sddm = {
      enable = true;
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

  xdg.portal = {
    enable = true;
    extraPortals = [ pkgs.xdg-desktop-portal-hyprland ];
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
    kdePackages.kwallet
    gnome-software
    gnome-software-plugin-flatpak
    kdePackages.dolphin
    slurp
    swappy
    xdg-desktop-portal-hyprland
    noctaliaShell
    sddmAstronautTheme
    inputs.snappy-switcher.packages.${pkgs.system}.default
  ];
}
