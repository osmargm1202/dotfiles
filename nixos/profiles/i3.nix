{ config, pkgs, ... }:

let
  i3-wallpaper-restore = pkgs.writeShellScriptBin "i3-wallpaper-restore" ''
    STATE_FILE="''${XDG_STATE_HOME:-$HOME/.local/state}/i3-wallpaper"
    WALL_DIR="''${XDG_PICTURES_DIR:-$HOME/Pictures}/Wallpapers"
    mkdir -p "$(dirname "$STATE_FILE")"

    if [ -f "$STATE_FILE" ] && [ -r "$(cat "$STATE_FILE")" ]; then
      feh --bg-fill "$(cat "$STATE_FILE")"
    elif [ -d "$WALL_DIR" ]; then
      WALL=$(find "$WALL_DIR" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) 2>/dev/null | shuf -n1)
      if [ -n "$WALL" ]; then
        feh --bg-fill "$WALL"
        echo "$WALL" > "$STATE_FILE"
      fi
    fi
  '';

  i3-wallpaper-random = pkgs.writeShellScriptBin "i3-wallpaper-random" ''
    STATE_FILE="''${XDG_STATE_HOME:-$HOME/.local/state}/i3-wallpaper"
    WALL_DIR="''${XDG_PICTURES_DIR:-$HOME/Pictures}/Wallpapers"
    mkdir -p "$(dirname "$STATE_FILE")"

    if [ -d "$WALL_DIR" ]; then
      WALL=$(find "$WALL_DIR" -type f \( -name '*.jpg' -o -name '*.png' -o -name '*.webp' \) 2>/dev/null | shuf -n1)
      if [ -n "$WALL" ]; then
        feh --bg-fill "$WALL"
        echo "$WALL" > "$STATE_FILE"
      fi
    fi
  '';

  i3-lock = pkgs.writeShellScriptBin "i3-lock" ''
    exec ${pkgs.i3lock-color}/bin/i3lock-color \
      --color=1a1b26 \
      --inside-color=1a1b2688 \
      --ring-color=7aa2f7 \
      --key-hl-color=bb9af7 \
      --bs-hl-color=f7768e \
      --separator-color=1a1b26 \
      --insidever-color=7aa2f788 \
      --insidewrong-color=f7768e88 \
      --ringver-color=7aa2f7 \
      --ringwrong-color=f7768e \
      --line-color=1a1b26 \
      --time-color=c0caf5 \
      --date-color=a9b1d6 \
      --greeter-color=a9b1d6 \
      --modif-color=c0caf5 \
      --ignore-empty-password \
      --show-failed-attempts \
      "$@"
  '';

  i3-powermenu = pkgs.writeShellScriptBin "i3-powermenu" ''
    CHOICE=$(printf "⏻ Apagar\n🔄 Reiniciar\n⏸ Suspender\n🚪 Cerrar sesión\n🔒 Bloquear" | \
      ${pkgs.rofi}/bin/rofi -dmenu -i -p "Power" -theme-str 'window { width: 20%; }')

    case "$CHOICE" in
      *Apagar*)     systemctl poweroff ;;
      *Reiniciar*)  systemctl reboot ;;
      *Suspender*)  systemctl suspend ;;
      *sesión*)     i3-msg exit ;;
      *Bloquear*)   i3-lock ;;
    esac
  '';

  i3-hotkeys = pkgs.writeShellScriptBin "i3-hotkeys" ''
    cat <<'EOF' | ${pkgs.rofi}/bin/rofi -dmenu -i -p "Atajos i3" -theme-str 'window { width: 45%; } listview { lines: 20; }'
Super+Return        → Terminal (kitty)
Super+M             → Launcher (rofi)
Super+E             → Gestor de archivos
Super+W             → Navegador (Chromium)
Super+C             → Editor (Zed)
Super+Q             → Cerrar ventana
Super+V             → Portapapeles
Super+P             → Captura de pantalla
Super+N             → Bloc de notas
Super+F             → Pantalla completa
Super+S             → Layout stacking
Super+G             → Layout tabbed
Super+Shift+G       → Toggle split
Super+Space         → Toggle floating
Super+1-0,F1-F4     → Cambiar workspace
Super+Shift+1-0     → Mover a workspace
Super+Shift+H       → Split horizontal
Super+Shift+V       → Split vertical
Super+Shift+R       → Reiniciar i3
Super+Shift+BackSp  → Recargar config
Super+Shift+E       → Salir de i3
Super+Alt+Space     → Wallpaper aleatorio
Super+Shift+L       → Bloquear pantalla
Super+Alt+P         → Apagar pantalla
Super+/             → Esta ayuda
EOF
  '';
in
{
  environment.systemPackages = with pkgs; [
    # Window manager & bar
    i3
    polybar
    i3lock-color

    # Compositor
    picom

    # Launcher & notifications
    rofi
    dunst

    # Wallpaper
    feh

    # System tray applets
    networkmanagerapplet
    blueman
    pasystray
    clipmenu

    # Session agents & utilities
    polkit_gnome
    gnome-keyring
    dex
    autorandr
    xss-lock
    xclip
    libnotify

    # Screenshot & audio
    flameshot
    pavucontrol

    # Config & utils
    system-config-printer
    xorg.xset
    xorg.xsetroot
    xorg.setxkbmap

    # Host-friendly replacement scripts
    i3-wallpaper-restore
    i3-wallpaper-random
    i3-lock
    i3-powermenu
    i3-hotkeys
  ];

  services.xserver.windowManager.i3 = {
    enable = true;
    extraPackages = with pkgs; [
      i3status
    ];
  };
}
