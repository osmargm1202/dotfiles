import GLib from "gi://GLib"

interface KeyBinding {
  keys: string
  action: string
  category: string
}

function loadKeyBindings(): KeyBinding[] {
  try {
    const [, out] = GLib.spawn_command_line_sync("hypr-keyhelper --list-json")
    const json = new TextDecoder().decode(out).trim()
    if (json) return JSON.parse(json)
  } catch {}
  return [
    { keys: "SUPER + T", action: "Terminal (Kitty)", category: "Apps" },
    { keys: "SUPER + E", action: "Archivos (Nautilus)", category: "Apps" },
    { keys: "SUPER + W", action: "Browser (Zen)", category: "Apps" },
    { keys: "SUPER + Space", action: "Lanzador", category: "Apps" },
    { keys: "SUPER + Q", action: "Cerrar ventana", category: "Ventanas" },
    { keys: "SUPER + Arrows", action: "Mover foco", category: "Ventanas" },
    { keys: "SUPER + 1-9", action: "Cambiar workspace", category: "Workspaces" },
    { keys: "SUPER + SHIFT + 1-9", action: "Mover ventana a workspace", category: "Workspaces" },
    { keys: "SUPER + L", action: "Bloquear pantalla", category: "Sistema" },
    { keys: "SUPER + M", action: "Menú principal", category: "Sistema" },
  ]
}

function sysInfo(): string {
  const hostname = GLib.get_host_name()
  const user = GLib.get_user_name()
  let uptime = "?"
  try {
    const [, out] = GLib.spawn_command_line_sync("uptime -p")
    uptime = new TextDecoder().decode(out).trim().replace("up ", "")
  } catch {}
  return `${user}@${hostname}  ·  ${uptime}`
}

export default function HelpPanel({ setup }: { setup?: (self: any) => void }) {
  const bindings = loadKeyBindings()
  const categories = [...new Set(bindings.map(b => b.category))]

  return (
    <revealer
      className="help-revealer"
      revealChild={false}
      transitionType={3}
      transitionDuration={200}
      setup={setup}
    >
      <box className="help-panel" vertical>
        <label className="panel-title" label="AYUDA" />
        <label className="sys-info" label={sysInfo()} />
        <scrollable widthRequest={320} heightRequest={320} hscrollbarPolicy={2}>
          <box vertical spacing={12}>
            {categories.map(cat => (
              <box vertical className="keybind-category">
                <label className="category-label" label={cat} halign={1} />
                {bindings
                  .filter(b => b.category === cat)
                  .map(b => (
                    <box className="keybind-row" spacing={8}>
                      <label className="keybind-keys" label={b.keys} />
                      <label className="keybind-action" label={b.action} />
                    </box>
                  ))}
              </box>
            ))}
          </box>
        </scrollable>
      </box>
    </revealer>
  )
}
