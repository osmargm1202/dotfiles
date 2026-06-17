import { bind } from "astal"
import Hyprland from "gi://AstalHyprland"

const hypr = Hyprland.get_default()

function WorkspaceButton({ id }: { id: number }) {
  const active = bind(hypr, "focusedWorkspace").as(ws => ws?.id === id)
  const occupied = bind(hypr, "workspaces").as(wss =>
    wss.some(ws => ws.id === id && ws.get_clients().length > 0)
  )

  return (
    <button
      className={active.as(a => `workspace-btn ${a ? "active" : ""}`)}
      onClicked={() => hypr.dispatch("workspace", String(id))}
      visible={occupied.as(o => o || id <= 5)}
    >
      {String(id)}
    </button>
  )
}

export default function Workspaces() {
  return (
    <box className="workspaces">
      <button
        className="menu-btn"
        onClicked={() => {
          import("astal/process").then(({ exec }) => exec("hypr-main-menu"))
        }}
      >
        ⊞
      </button>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(id => (
        <WorkspaceButton id={id} />
      ))}
    </box>
  )
}
