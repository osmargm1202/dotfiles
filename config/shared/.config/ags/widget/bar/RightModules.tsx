import { bind } from "astal"
import { exec } from "astal/process"
import Network from "gi://AstalNetwork"
import Bluetooth from "gi://AstalBluetooth"

const network = Network.get_default()
const bluetooth = Bluetooth.get_default()

function AudioModule() {
  return (
    <button
      className="bar-module"
      onClicked={() => exec("hypr-audio-device-menu")}
      tooltipText="Audio"
    >
      🔊
    </button>
  )
}

function NetworkModule() {
  const wifi = bind(network, "wifi")
  const icon = wifi.as(w => {
    if (!w || !w.get_enabled()) return "󰖪"
    return w.get_icon_name() ?? "󰖩"
  })
  return (
    <button
      className="bar-module"
      onClicked={() => exec("hypr-wifi-menu")}
      tooltipText="Red"
      label={icon}
    />
  )
}

function BluetoothModule() {
  const powered = bind(bluetooth, "isPowered")
  return (
    <button
      className={powered.as(p => `bar-module${p ? "" : " disabled"}`)}
      onClicked={() => exec("hypr-bluetooth-menu")}
      tooltipText="Bluetooth"
    >
      󰂯
    </button>
  )
}

function ClipboardModule() {
  return (
    <button
      className="bar-module"
      onClicked={() => exec("hypr-rofi-clipboard")}
      tooltipText="Portapapeles"
    >
      󰅌
    </button>
  )
}

function ThemeModule() {
  return (
    <button
      className="bar-module"
      onClicked={() => exec("orgm-themes toggle")}
      tooltipText="Cambiar tema"
    >
      󰔎
    </button>
  )
}

export default function RightModules() {
  return (
    <box className="right-modules" spacing={4}>
      <AudioModule />
      <NetworkModule />
      <BluetoothModule />
      <ClipboardModule />
      <ThemeModule />
      {/* Wallpaper, Help, Specs placeholders — filled in Tasks 7, 8, 9 */}
      <button className="bar-module" tooltipText="Wallpaper (próximamente)">󰋩</button>
      <button className="bar-module" tooltipText="Ayuda (próximamente)">󰘥</button>
      <button className="bar-module" tooltipText="Specs (próximamente)">󰍛</button>
    </box>
  )
}
