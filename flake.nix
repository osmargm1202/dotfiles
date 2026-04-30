{
  description = "Modular NixOS flake for orgm";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    snappy-switcher.url = "github:OpalAayan/snappy-switcher";
    caelestia-shell = {
      url = "github:caelestia-dots/shell";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    dms = {
      url = "github:AvengeMedia/DankMaterialShell/stable";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    dgop = {
      url = "github:AvengeMedia/dgop";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    sddm-astronaut-theme = {
      url = "github:Keyitdev/sddm-astronaut-theme";
      flake = false;
    };
  };


  outputs = inputs@{ nixpkgs, ... }: let
    system = "x86_64-linux";
    mkHost = {
      hostName,
      hardware,
      profile,
      extraModules ? [ ],
    }:
      nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = { inherit inputs; };
        modules = [
          ./nixos/common.nix
          hardware
          profile
          { networking.hostName = hostName; }
        ] ++ extraModules;
      };
    mkProfile = {
      profile,
      hostName ? "nixos",
      extraModules ? [ ],
    }:
      nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = { inherit inputs; };
        modules = [
          ./nixos/common.nix
          /etc/nixos/hardware-configuration.nix
          profile
          { networking.hostName = hostName; }
        ] ++ extraModules;
      };
  in {
    formatter.${system} = nixpkgs.legacyPackages.${system}.nixfmt-rfc-style;

    nixosConfigurations = {
      gnome = mkProfile {
        profile = ./nixos/profiles/gnome.nix;
      };
      hyprland = mkProfile {
        profile = ./nixos/profiles/hyprland.nix;
      };
      niri = mkProfile {
        profile = ./nixos/profiles/niri.nix;
      };
      labwc = mkProfile {
        profile = ./nixos/profiles/labwc.nix;
      };
      labwc-light = mkProfile {
        profile = ./nixos/profiles/labwc-light.nix;
      };
      i3 = mkProfile {
        profile = ./nixos/profiles/i3.nix;
      };
      orgm-gnome = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/gnome.nix;
        extraModules = [ ./nixos/hosts/orgm/plymouth.nix ];
      };
      orgm-hyprland = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/hyprland.nix;
        extraModules = [ ./nixos/hosts/orgm/plymouth.nix ];
      };
      orgm-niri = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/niri.nix;
        extraModules = [ ./nixos/hosts/orgm/plymouth.nix ];
      };
      orgm-labwc = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/labwc.nix;
        extraModules = [ ./nixos/hosts/orgm/plymouth.nix ];
      };

      ero-labwc = mkHost {
        hostName = "ero";
        hardware = ./nixos/hosts/ero/hardware-configuration.nix;
        profile = ./nixos/profiles/labwc.nix;
        extraModules = [ ./nixos/hosts/ero/plymouth.nix ];
      };
      ero-i3 = mkHost {
        hostName = "ero";
        hardware = ./nixos/hosts/ero/hardware-configuration.nix;
        profile = ./nixos/profiles/i3.nix;
        extraModules = [ ./nixos/hosts/ero/plymouth.nix ];
      };
      lenovo-labwc = mkHost {
        hostName = "lenovo";
        hardware = ./nixos/hosts/lenovo/hardware-configuration.nix;
        profile = ./nixos/profiles/labwc.nix;
        extraModules = [ ./nixos/hosts/lenovo/plymouth.nix ];
      };
    };
  };
}
