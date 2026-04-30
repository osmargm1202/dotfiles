{ pkgs, lib, ... }:

let
  pkgNames = [
    # Core tools
    "age"
    "bash-completion"
    "bat"
    "bc"
    "btop"
    "diffutils"
    "duf"
    "eza"
    "fastfetch"
    "fd"
    "fish"
    "flameshot"
    "freerdp"
    "fzf"
    "gh"
    "github-cli"
    "glfw"
    "glibcLocales"
    "glow"
    "go"
    "gum"
    "helix"
    "htop"
    "inetutils"
    "inotify-tools"
    "jq"
    "kitty"
    "less"
    "libnotify"
    "lsof"
    "man-db"
    "man-pages"
    "mesa"
    "mesa-demos"
    "mesa-utils"
    "mtr"
    "nano"
    "ncdu"
    "neovim"
    "nodejs"
    "npm"
    "pandoc"
    "pandoc-cli"
    "pigz"
    "ripgrep"
    "rsync"
    "rustup"
    "sops"
    "starship"
    "stow"
    "sudo"
    "tcpdump"
    "time"
    "traceroute"
    "tree"
    "ttf-jetbrains-mono-nerd"
    "nerd-fonts.jetbrains-mono"
    "unzip"
    "uv"
    "vim"
    "watchexec"
    "xdg-utils"
    "wget"
    "wl-clipboard"
    "xclip"
    "xorg.xauth"
    "yazi"
    "zip"
    "zoxide"

    # Docker
    "docker"
    "docker-buildx"
    "docker-compose"

    # Git / repos
    "git"
    "github-cli"

    # Fonts / tex stack
    "texlive-basic"
    "texlive-fontsrecommended"
    "texlive-langenglish"
    "texlive-langeuropean"
    "texlive-langspanish"
    "texlive-latex"
    "texlive-latexrecommended"
    "texlive-xetex"
    "texlive.combined.scheme-small"

    # NVIDIA-free graphic stack extras
    "vulkan-intel"
    "vulkan-radeon"
  ];

  # Resolve package names when available; skip unknowns to avoid build breaks.
  toPackage = name:
    let
      path = lib.splitString "." name;
      resolved = builtins.tryEval (builtins.getAttrFromPath path pkgs);
    in
      if resolved.success then [ resolved.value ] else [ ];

  toPackages = names: lib.concatMap toPackage names;

in
{
  environment.systemPackages = toPackages pkgNames;
}
