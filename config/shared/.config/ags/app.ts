import { App } from "astal/gtk3"

App.start({
  css: `${import.meta.dir}/style/main.css`,
  main() {
    console.log("AGS shell starting")
    App.get_monitors().forEach(monitor => {
      console.log(`Monitor: ${monitor.get_model()}`)
    })
  },
})
