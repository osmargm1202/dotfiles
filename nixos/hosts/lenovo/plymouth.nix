{ pkgs, ... }:

let
  themeName = "lenovo-orgm";
in
{
  boot.plymouth = {
    theme = themeName;
    themePackages = [
      (pkgs.callPackage ../../plymouth-logo-theme.nix {
        inherit themeName;
        logo = ../../plymouth-logos/orgm-nixos.png;
        background = "0.0, 0.0, 0.0";
        logoScale = 100;
      })
    ];
  };
}
