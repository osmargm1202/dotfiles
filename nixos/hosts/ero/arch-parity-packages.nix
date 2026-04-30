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

  lookupPkg = names:
    let
      resolve = name: builtins.foldl' (
        acc: p:
          if acc == null
          then null
          else if builtins.isAttrs acc && builtins.hasAttr p acc
          then acc.${p}
          else null
      ) pkgs (lib.splitString "." name);
    in
    builtins.map resolve names;

  selected = builtins.filter (p: p != null) (lookupPkg pkgNames);
in
{
  environment.systemPackages = selected;
}
