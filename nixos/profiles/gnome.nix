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

  environment.systemPackages = with pkgs; [
    adwaita-icon-theme
    gnome-themes-extra
    gnomeExtensions.blur-my-shell
    gnomeExtensions.arc-menu
    gnomeExtensions.appindicator
    gnomeExtensions.caffeine
    gnomeExtensions.clipboard-history
    gnomeExtensions.night-theme-switcher
    gnomeExtensions.removable-drive-menu
    gnomeExtensions.system-monitor
    gnomeExtensions.app-menu-is-back
    gnomeExtensions.background-logo
    gnomeExtensions.launch-new-instance
    gnomeExtensions.windowswitcher
    gnomeExtensions.vitals
    gnomeExtensions.paperwm
    gnomeExtensions.quick-launch
  ];
}
