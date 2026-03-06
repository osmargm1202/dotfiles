{ pkgs, inputs, system, ... }:

{
  programs.niri.enable = true;
  services.displayManager.gdm.enable = true;

  users.users.osmarg.packages = with pkgs; [
      ddcutil
      brightnessctl
      app2unit
      cava
      lm_sensors
      aubio
      swappy
      qalculate-qt
      material-symbols
      nerd-fonts.caskaydia-cove
      inputs.caelestia-shell.packages.${system}.with-cli
      adwaita-icon-theme
      gnome-themes-extra
  ];
}
