import { bind, exec } from "astal"
import Hyprland from "gi://AstalHyprland"

const hypr = Hyprland.get_default()

interface AppButtonProps {
  icon: string
  appClass: string
  launchCmd: string
  label: string
}

export default function AppButton({ icon, appClass, launchCmd, label }: AppButtonProps) {
  const clients = bind(hypr, "clients")

  const running = clients.as(cs =>
    cs.some(c => c.get_class().toLowerCase().includes(appClass.toLowerCase()))
  )
  const active = clients.as(() => {
    const focused = hypr.get_focused_client()
    return focused?.get_class().toLowerCase().includes(appClass.toLowerCase()) ?? false
  })

  return (
    <button
      className={running.as(r => `dock-app ${r ? "running" : ""}`)}
      tooltipText={label}
      onClicked={() => {
        const match = hypr.get_clients().find(c =>
          c.get_class().toLowerCase().includes(appClass.toLowerCase())
        )
        if (match) {
          hypr.dispatch("focuswindow", `address:${match.get_address()}`)
        } else {
          exec(launchCmd)
        }
      }}
    >
      <box vertical spacing={2}>
        <image file={icon} widthRequest={38} heightRequest={38} />
        <box
          className={active.as(a => `app-indicator ${a ? "active" : ""}`)}
          widthRequest={6}
          heightRequest={6}
          halign={3}
          visible={running}
        />
      </box>
    </button>
  )
}
