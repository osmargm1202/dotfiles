{ pkgs, ... }:

{
  services.xserver.enable = true;

  services.xserver.xkb = {
    layout = "us,latam";
    variant = "";
  };

  services.desktopManager.gnome.enable = true;
  services.displayManager.gdm.enable = true;
  services.displayManager.gdm.autoSuspend = true;

  home-manager.users.osmarg = { ... }: {
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
