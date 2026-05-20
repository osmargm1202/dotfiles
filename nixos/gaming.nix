{ pkgs, ... }:

{
  programs.gamemode.enable = true;

  programs.steam = {
    enable = true;
    remotePlay.openFirewall = true;
    dedicatedServer.openFirewall = true;
    gamescopeSession.enable = true;
  };

  services.sunshine = {
    enable = true;
    autoStart = true;
    capSysAdmin = true; # Required for reliable DRM/KMS capture on Wayland.
    openFirewall = true;
  };

  environment.systemPackages = with pkgs; [
    mangohud
    gamescope
    protonup-qt
    steam-run

    # Emulators for heavier local platforms. Smaller ROM libraries can stay in RomM.
    dolphin-emu # GameCube / Wii
    pcsx2 # PlayStation 2
    rpcs3 # PlayStation 3

    # Optional launchers/frontends; uncomment per host/use case.
    # lutris
    # heroic
    # bottles
    # retroarch
  ];

  # Flathub is enabled globally in common.nix. Install Yuzu manually when needed:
  # flatpak install flathub org.yuzu_emu.yuzu
}
