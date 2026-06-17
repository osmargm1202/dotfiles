import { App, Gdk } from "astal/gtk3"
import Astal from "gi://Astal"
import Workspaces from "./bar/Workspaces"
import Clock from "./bar/Clock"

export default function Bar(monitor: Gdk.Monitor) {
  return (
    <window
      className="bar top-bar"
      gdkmonitor={monitor}
      anchor={
        Astal.WindowAnchor.TOP |
        Astal.WindowAnchor.LEFT |
        Astal.WindowAnchor.RIGHT
      }
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      layer={Astal.Layer.TOP}
      marginTop={10}
      marginLeft={12}
      marginRight={12}
    >
      <centerbox>
        <Workspaces />
        <Clock />
        <box />
      </centerbox>
    </window>
  )
}
