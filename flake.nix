{
  description = "Modular NixOS flake for orgm";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ nixpkgs, ... }: let
    system = "x86_64-linux";
    mkHost = module:
      nixpkgs.lib.nixosSystem {
        inherit system;
        specialArgs = { inherit inputs; };
        modules = [ module ];
      };
  in {
    formatter.${system} = nixpkgs.legacyPackages.${system}.nixfmt-rfc-style;

    nixosConfigurations = {
      orgm-gnome = mkHost ./nixos/hosts/orgm/gnome.nix;
      orgm-hyprland = mkHost ./nixos/hosts/orgm/hyprland.nix;
    };
  };
}
