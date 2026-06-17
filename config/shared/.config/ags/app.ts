import { App } from "astal/gtk3"
import Bar from "./widget/Bar"

App.start({
  css: `${import.meta.dir}/style/main.css`,
  main() {
    App.get_monitors().forEach(monitor => Bar(monitor))
  },
})
