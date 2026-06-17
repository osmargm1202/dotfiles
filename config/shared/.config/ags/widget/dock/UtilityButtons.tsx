import { exec } from "astal"
import GLib from "gi://GLib"

const HOME = GLib.get_home_dir()
const ICONS_DIR = `${HOME}/.config/waybar-hypr/icons`

interface UtilBtn {
  icon?: string
  emoji?: string
  cmd: string
  label: string
  className?: string
}

const BUTTONS: UtilBtn[] = [
  { icon: `${ICONS_DIR}/usb_devices.svg`,        cmd: "hypr-usb-menu",            label: "USB" },
  { icon: `${ICONS_DIR}/memclean.svg`,            cmd: "memclean-dev",             label: "MemClean" },
  { icon: `${ICONS_DIR}/nixclean.svg`,            cmd: "hypr-nix-clean",           label: "NixClean" },
  { icon: `${ICONS_DIR}/pi_status.svg`,           cmd: "waybar-pi-status",         label: "Pi" },
  { icon: `${ICONS_DIR}/headset_reconnect.svg`,   cmd: "hypr-bluetooth-reconnect", label: "Headset" },
  { icon: `${ICONS_DIR}/hardware_fetch.svg`,      cmd: "hypr-config-editor",       label: "Config" },
  { icon: `${ICONS_DIR}/logout_menu.svg`,         cmd: "hypr-power-menu",          label: "Power", className: "power-btn" },
]

export default function UtilityButtons() {
  return (
    <box className="utility-buttons" spacing={4} halign={2}>
      <box
        className="util-separator"
        widthRequest={2}
        heightRequest={26}
      />
      {BUTTONS.map(btn => (
        <button
          className={`util-btn ${btn.className ?? ""}`}
          tooltipText={btn.label}
          onClicked={() => exec(btn.cmd)}
        >
          {btn.icon ? (
            <image
              file={btn.icon}
              widthRequest={20}
              heightRequest={20}
            />
          ) : (
            <label label={btn.emoji ?? "?"} />
          )}
        </button>
      ))}
    </box>
  )
}
