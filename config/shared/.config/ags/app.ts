import { App } from "astal/gtk3"
import Bar from "./widget/Bar"
import Dock from "./widget/Dock"

App.start({
  css: `${import.meta.dir}/style/main.css`,
  main() {
    App.get_monitors().forEach(monitor => {
      Bar(monitor)
      Dock(monitor)
    })
  },
})
