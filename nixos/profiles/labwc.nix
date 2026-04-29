{ pkgs, inputs, ... }:

let
  system = pkgs.stdenv.hostPlatform.system;
  dgop = inputs.dgop.packages.${system}.default;
  labwcTasklist =
    let
      pythonWithGtk = pkgs.python3.withPackages (ps: [ ps.pygobject3 ]);
      script = pkgs.writeText "labwc-tasklist.py" ''
        #!/usr/bin/env python3
        """
        Overview/Exposé-like script tested on labwc 0.93+ to add a cool overlay 
        under the native labwc task switcher.

        - make sure to install: wlrctl and wtype
        - make sure to install the required python dependencies
        - chmod +x labwc-tasklist
        - bind it to a convenient key combo / mouse button (rc.xml on labwc)
        - enjoy!

        To prevent this script from showing up in the tasks add this to rc.xml
        <windowRules>
          <windowRule title="labwc-tasklist">
            <skipWindowSwitcher>yes</skipWindowSwitcher>
          </windowRule>
        </windowRules>
        """

        author = "alpha6z"
        license = "GPLv3"
        version = "0.2"

        import gi
        import subprocess
        import shlex
        import sys
        #import os

        gi.require_version("Gtk", "3.0")
        from gi.repository import Gtk, Gdk, GLib


        class DimWindow(Gtk.Window):
            def __init__(self):
                super().__init__()
                self.set_decorated(False)
                self.set_default_size(800, 600)
                self.fullscreen()
                self.set_keep_above(True)
                self.set_app_paintable(True)
                self._focus_seen = False
                self._started_taskman = False

                # hardcode the filename or make it flexible with: 
                # os.path.basename(sys.argv[0]).lower()
                # edit "<windowRule title=" in rc.xml to match your filename!
                self._toplevel_name = "labwc-tasklist"

                screen = self.get_screen()
                visual = screen.get_rgba_visual()
                if visual and self.is_composited():
                    self.set_visual(visual)

                self.add_events(
                    Gdk.EventMask.BUTTON_PRESS_MASK
                    | Gdk.EventMask.BUTTON_RELEASE_MASK
                    | Gdk.EventMask.KEY_PRESS_MASK
                    | Gdk.EventMask.FOCUS_CHANGE_MASK
                )
                self.connect("focus-in-event", self.on_focus_in)
                self.connect("draw", self.on_draw)
                self.connect("button-press-event", self.on_button_press)
                self.connect("button-release-event", self.on_button_release)
                self.connect("key-press-event", self.on_key_press)

                self.start_task_manager()

                self._poll_interval_ms = 250
                GLib.timeout_add(self._poll_interval_ms, self._poll_focused_toplevel)

            def on_draw(self, widget, cr):
                cr.set_source_rgba(0, 0, 0, 0.85)
                cr.paint()
                return False

            def on_button_press(self, widget, event):
                # close on any mouse button press
                self.close()
                return True

            def on_button_release(self, widget, event):
                # consume release to avoid propagation
                return True

            def on_key_press(self, widget, event):
                # close on any key press (including Esc)
                self.close()
                return True
                
            def on_focus_in(self, widget, event):
                # ignore the first focus_in
                if not self._focus_seen:
                    self._focus_seen = True
                    return False
                # ESC keypress on labwc task switcher => exit the overlay as well
                self.close()
                Gtk.main_quit()
                return False

            def start_task_manager(self):
                try:
                    # invoke the labwc task switcher
                    subprocess.Popen(shlex.split("wtype -M alt -s 200 -k Tab"))
                    self._started_taskman = True
                except Exception:
                    self._started_taskman = False

            def get_focused_toplevel(self):
                try:
                    # check the focused toplevel
                    out = subprocess.check_output(
                        shlex.split("wlrctl toplevel list state:focused"),
                        stderr=subprocess.DEVNULL,
                        timeout=1,
                    )
                    text = out.decode(errors="ignore").strip()
                    return text if text else None
                except Exception:
                    return None

            def _poll_focused_toplevel(self):
                focused = self.get_focused_toplevel()
                if focused is None:
                    self.close()
                    Gtk.main_quit()
                    return False

                # does this script filename still show up in the wlrctl output as the focused toplevel?
                if self._toplevel_name not in focused.lower():
                    self.close()
                    Gtk.main_quit()
                    return False
                return True


        def main():
            win = DimWindow()
            win.connect("destroy", Gtk.main_quit)
            win.show_all()
            Gtk.main()


        if __name__ == "__main__":
            main()
      '';
    in
    pkgs.writeShellScriptBin "labwc-tasklist" ''
      export PATH="${
        pkgs.lib.makeBinPath [
          pkgs.wlrctl
          pkgs.wtype
        ]
      }:$PATH"
      exec ${pythonWithGtk}/bin/python3 ${script} "$@"
    '';
  sddmAstronautTheme = pkgs.callPackage ../packages/sddm-astronaut-theme.nix {
    src = inputs.sddm-astronaut-theme;
  };
in
{
  imports = [
    inputs.dms.nixosModules.dank-material-shell
  ];

  services.xserver.enable = true;
  services.xserver.xkb = {
    layout = "us,latam";
    variant = "altgr-intl,";
    options = "grp:ctrl_space_toggle";
  };

  services.displayManager = {
    defaultSession = "labwc";
    sddm = {
      enable = true;
      wayland.enable = true;
      autoNumlock = true;
      theme = "sddm-astronaut-theme";
      extraPackages = with pkgs.qt6; [
        qtmultimedia
        qtsvg
        qtvirtualkeyboard
      ];
      settings.General = {
        InputMethod = "qtvirtualkeyboard";
        Numlock = "on";
      };
    };
  };

  programs.labwc.enable = true;
  programs.xwayland.enable = true;

  programs.dank-material-shell = {
    enable = true;
    systemd = {
      enable = true;
      restartIfChanged = true;
    };
    dgop.package = dgop;
    enableClipboardPaste = true;
    enableDynamicTheming = true;
    enableSystemMonitoring = true;
  };

  programs.nautilus-open-any-terminal = {
    enable = true;
    terminal = "kitty";
  };

  xdg.portal = {
    enable = true;
    wlr.enable = true;
    extraPortals = with pkgs; [
      xdg-desktop-portal-wlr
      xdg-desktop-portal-gtk
    ];
    config = {
      common.default = [
        "wlr"
        "gtk"
      ];
      wlroots.default = [
        "wlr"
        "gtk"
      ];
      labwc = {
        default = [
          "wlr"
          "gtk"
        ];
        "org.freedesktop.impl.portal.FileChooser" = [ "gtk" ];
        "org.freedesktop.impl.portal.OpenURI" = [ "gtk" ];
      };
    };
  };

  xdg.terminal-exec = {
    enable = true;
    settings = {
      labwc = [ "kitty.desktop" ];
      default = [ "kitty.desktop" ];
    };
  };

  xdg.mime = {
    enable = true;
    defaultApplications = {
      "inode/directory" = [ "org.gnome.Nautilus.desktop" ];
      "text/plain" = [ "org.gnome.TextEditor.desktop" ];
      "text/markdown" = [ "org.gnome.TextEditor.desktop" ];
      "application/pdf" = [ "org.gnome.Papers.desktop" ];
      "image/png" = [ "org.gnome.Loupe.desktop" ];
      "image/jpeg" = [ "org.gnome.Loupe.desktop" ];
      "image/webp" = [ "org.gnome.Loupe.desktop" ];
      "image/gif" = [ "org.gnome.Loupe.desktop" ];
      "application/zip" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-tar" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-7z-compressed" = [ "org.gnome.FileRoller.desktop" ];
      "application/x-rar" = [ "org.gnome.FileRoller.desktop" ];
    };
  };

  services.pipewire = {
    enable = true;
    audio.enable = true;
    pulse.enable = true;
    alsa.enable = true;
    alsa.support32Bit = true;
    wireplumber.enable = true;
  };

  security.polkit.enable = true;
  security.pam.services.sddm.enableGnomeKeyring = true;
  security.pam.services.login.enableGnomeKeyring = true;

  services.dbus.enable = true;
  services.gvfs.enable = true;
  services.gnome.gnome-keyring.enable = true;
  programs.dconf.enable = true;

  environment.sessionVariables = {
    NIXOS_OZONE_WL = "1";
    MOZ_ENABLE_WAYLAND = "1";
    XDG_SESSION_TYPE = "wayland";
    XDG_SESSION_DESKTOP = "labwc";
    XDG_CURRENT_DESKTOP = "labwc:wlroots";
    QT_QPA_PLATFORM = "wayland";
    QT_QPA_PLATFORMTHEME = "gtk3";
    QT_QPA_PLATFORMTHEME_QT6 = "gtk3";
    ELECTRON_OZONE_PLATFORM_HINT = "auto";
    TERMINAL = "kitty";
  };

  environment.systemPackages = with pkgs; [
    labwc
    labwc-tweaks
    python3
    xwayland

    sddmAstronautTheme
    kitty
    fuzzel
    swayidle
    swaylock
    wlopm

    mpvpaper
    mpv
    ffmpeg

    xdg-utils
    xdg-desktop-portal
    xdg-desktop-portal-wlr
    xdg-desktop-portal-gtk

    wl-clipboard
    cliphist
    grim
    slurp
    swappy
    wlr-randr
    wlrctl
    wtype
    brightnessctl
    pamixer
    playerctl

    nautilus
    gnome-text-editor
    gnome-calculator
    papers
    loupe
    file-roller
    gnome-system-monitor
    gnome-disk-utility
    sushi
    baobab

    adwaita-icon-theme
    papirus-icon-theme
    hicolor-icon-theme
    gnome-themes-extra
    gnome-tweaks
    yaru-remix-theme
    shared-mime-info
    dconf
    glib
    gnome-keyring
    labwcTasklist
    polkit_gnome
  ];
}
