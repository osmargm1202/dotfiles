{ pkgs, ... }:

let
  themeName = "orgm-msi";
in
{
  boot.plymouth = {
    theme = themeName;
    themePackages = [
      (pkgs.callPackage ../../plymouth-logo-theme.nix {
        inherit themeName;
        logo = ../../plymouth-logos/msi.png;
        background = "0.0, 0.0, 0.0";
        logoScale = 32;
      })
    ];
  };
}
