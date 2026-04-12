{ pkgs, ... }:

{
  services.xserver.enable = true;

  services.xserver.xkb = {
    layout = "us,latam";
    variant = "";
  };

  services.desktopManager.gnome.enable = true;

  services.displayManager.gdm = {
    enable = true;
    autoSuspend = true;
  };

  systemd.services.flatpak-repo.script = ''
    flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
    flatpak remote-add --if-not-exists flathub https://nightly.gnome.org/gnome-nightly.flatpakrepo
    flatpak remote-add --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  '';

  environment.systemPackages = with pkgs; [
    gnome-tweaks
    yaru-remix-theme
    gnomeExtensions.user-themes
    gnomeExtensions.blur-my-shell
    gnomeExtensions.appindicator
    gnomeExtensions.caffeine
    gnomeExtensions.removable-drive-menu
    gnomeExtensions.system-monitor
    gnomeExtensions.background-logo
    gnomeExtensions.dash-to-dock
    gnomeExtensions.gnome-40-ui-improvements
    gnomeExtensions.pip-on-top
    gnomeExtensions.tiling-shell
    gnomeExtensions.veil
    gnomeExtensions.burn-my-windows
    gnomeExtensions.clipboard-indicator
    gnomeExtensions.easy-docker-containers
  ];
}
