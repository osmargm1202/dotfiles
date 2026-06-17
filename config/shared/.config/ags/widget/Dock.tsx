import { Gdk } from "astal/gtk3"
import Astal from "gi://Astal"
import AppButton from "./dock/AppButton"
import UtilityButtons from "./dock/UtilityButtons"
import GLib from "gi://GLib"

const HOME = GLib.get_home_dir()
const ICONS = `${HOME}/.local/share/icons`

const PINNED_APPS = [
  { icon: `${ICONS}/kitty.svg`,             appClass: "kitty",    launchCmd: "kitty",    label: "Terminal" },
  { icon: `${ICONS}/nautilus.png`,          appClass: "nautilus", launchCmd: "nautilus", label: "Archivos" },
  { icon: `${ICONS}/zen-browser.png`,       appClass: "zen",      launchCmd: "zen",      label: "Zen Browser" },
  { icon: `${ICONS}/chromium-browser.svg`,  appClass: "chromium", launchCmd: "chromium", label: "Chromium" },
  { icon: `${ICONS}/obsidian.png`,          appClass: "obsidian", launchCmd: "obsidian", label: "Obsidian" },
]

export default function Dock(monitor: Gdk.Monitor) {
  return (
    <window
      className="dock-bar"
      gdkmonitor={monitor}
      anchor={
        Astal.WindowAnchor.BOTTOM |
        Astal.WindowAnchor.LEFT |
        Astal.WindowAnchor.RIGHT
      }
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      layer={Astal.Layer.TOP}
      marginBottom={10}
      marginLeft={12}
      marginRight={12}
    >
      <centerbox>
        <box />
        <box className="dock-apps" spacing={8}>
          {PINNED_APPS.map(app => <AppButton {...app} />)}
        </box>
        <UtilityButtons />
      </centerbox>
    </window>
  )
}
