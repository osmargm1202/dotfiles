{ pkgs, lib, inputs, ... }:

let
  system = pkgs.stdenv.hostPlatform.system;
  noctaliaShell = inputs.noctalia.packages.${system}.default;
  sddmAstronautTheme = pkgs.callPackage ../packages/sddm-astronaut-theme.nix {
    src = inputs.sddm-astronaut-theme;
  };
in {
  services.xserver.enable = true;

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

  environment.etc."xdg/hypr/hyprland.conf".text = lib.mkDefault ''
    exec-once = ${lib.getExe noctaliaShell}
  '';

  environment.systemPackages = with pkgs; [
    kitty
    wl-clipboard
    grim
    slurp
    xdg-desktop-portal-hyprland
    noctaliaShell
    sddmAstronautTheme
  ];
}
