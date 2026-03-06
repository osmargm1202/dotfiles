{ pkgs, inputs, system, ... }:

{
  programs.niri.enable = true;
  services.displayManager.gdm.enable = true;

  home-manager.users.osmarg = { ... }: {
    home.packages = with pkgs; [
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
    ];

    dconf.settings."org/gnome/desktop/interface" = {
      icon-theme = "Nordic-darker";
      cursor-theme = "Adwaita";
      gtk-theme = "Adwaita";
    };

    gtk = {
      enable = true;
      iconTheme = {
        name = "Nordic-darker";
      };
      cursorTheme = {
        name = "Adwaita";
        package = pkgs.adwaita-icon-theme;
      };
      theme = {
        name = "Adwaita";
        package = pkgs.gnome-themes-extra;
      };
    };
  };
}
