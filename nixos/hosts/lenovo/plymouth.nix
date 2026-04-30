{ pkgs, ... }:

let
  themeName = "lenovo-logo";
in
{
  boot.plymouth = {
    theme = themeName;
    themePackages = [
      (pkgs.callPackage ../../plymouth-logo-theme.nix {
        inherit themeName;
        logo = ../../plymouth-logos/lenovo.png;
        background = "0.85, 0.0, 0.0";
        logoScale = 45;
      })
    ];
  };
}
