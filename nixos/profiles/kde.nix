{ ... }:

{
  services.xserver.enable = true;

  services.xserver.xkb = {
    layout = "us,latam";
    variant = "";
  };

  services.displayManager.sddm.enable = true;
  services.desktopManager.plasma6.enable = true;

  security.pam.services.sddm.enableKwallet = true;
}
