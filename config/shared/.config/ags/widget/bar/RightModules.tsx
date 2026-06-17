import { bind } from "astal"
import { exec } from "astal/process"
import Network from "gi://AstalNetwork"
import Bluetooth from "gi://AstalBluetooth"
import SpecsPanel from "../popups/SpecsPanel"
import WallpaperMenu from "../popups/WallpaperMenu"

const network = Network.get_default()
const bluetooth = Bluetooth.get_default()

let specsRevealer: any = null
let wallpaperRevealer: any = null

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

function WallpaperButton() {
  return (
    <button
      className="bar-module"
      onClicked={() => {
        const current = wallpaperRevealer?.get_reveal_child()
        wallpaperRevealer?.set_reveal_child(!current)
      }}
      tooltipText="Wallpaper"
    >
      󰋩
    </button>
  )
}

function SpecsButton() {
  return (
    <button
      className="bar-module specs-btn"
      tooltipText="Specs del sistema"
      onHover={() => specsRevealer?.set_reveal_child(true)}
      onHoverLost={() => specsRevealer?.set_reveal_child(false)}
    >
      󰍛
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
      <box vertical>
        <WallpaperButton />
        <WallpaperMenu setup={self => (wallpaperRevealer = self)} />
      </box>
      {/* Help placeholder — filled in Task 9 */}
      <button className="bar-module" tooltipText="Ayuda (próximamente)">󰘥</button>
      <box vertical>
        <SpecsButton />
        <SpecsPanel setup={self => (specsRevealer = self)} />
      </box>
    </box>
  )
}
