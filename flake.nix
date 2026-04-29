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
    }:
      nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = { inherit inputs; };
        modules = [
          ./nixos/common.nix
          hardware
          profile
          { networking.hostName = hostName; }
        ];
      };
  in {
    formatter.${system} = nixpkgs.legacyPackages.${system}.nixfmt-rfc-style;

    nixosConfigurations = {
      orgm-gnome = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/gnome.nix;
      };
      orgm-hyprland = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/hyprland.nix;
      };
      orgm-niri = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/niri.nix;
      };
      orgm-labwc = mkHost {
        hostName = "orgm";
        hardware = ./nixos/hosts/orgm/hardware-configuration.nix;
        profile = ./nixos/profiles/labwc.nix;
      };
    };
  };
}
