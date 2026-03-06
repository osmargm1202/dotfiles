{
  description = "NixOS config + CLI development shell";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager/master";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, home-manager, ... }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };

      cliPackages = with pkgs; [
        bat
        bc
        bind
        ctop
        diffutils
        docker
        docker-buildx
        docker-compose
        duf
        eza
        fd
        fastfetch
        fish
        fzf
        git
        gh
        go
        hcxdumptool
        hcxtools
        htop
        inetutils
        jq
        kitty
        less
        lsof
        man-db
        man-pages
        mtr
        nano
        ncdu
        neovim
        nmap
        nodejs
        npm
        openssh
        podman
        python314
        python314Packages.pip
        rsync
        rustc
        cargo
        socat
        starship
        tcpdump
        time
        tmux
        tree
        unzip
        uv
        vim
        watchexec
        wget
        wifite2
        wireshark-cli
        xorg.xauth
        zip
        zoxide
      ];

      cliShell = pkgs.mkShell {
        packages = cliPackages;
      };
    in {
      devShells.${system} = {
        default = cliShell;
        cli = cliShell;
      };

      nixosConfigurations.orgm = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          ./configuration.nix
          home-manager.nixosModules.home-manager
        ];
      };
    };
}
