import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick

ShellRoot {
  id: root

  property string stateHome: Quickshell.env("XDG_STATE_HOME") || ((Quickshell.env("HOME") || "") + "/.local/state")
  property string requestPath: Quickshell.env("HYPR_WALLPAPER_REQUEST") || (stateHome + "/hypr-wallpaper/wallpaper-picker-request.json")
  property string dataPath: Quickshell.env("HYPR_WALLPAPER_DATA") || (stateHome + "/hypr-wallpaper/wallpaper-picker.json")
  property bool panelVisible: (Quickshell.env("HYPR_WALLPAPER_SHOW") || "") === "1"
  property var data: ({ mode: "combined", initialMode: "static", script: "orgm-hypr", scriptArgs: ["wallpaper"], tabs: ({ static: { title: "Normal wallpapers", applyCommand: "set-static", randomCommand: "random-static", current: "", items: [] }, video: { title: "Live wallpapers", applyCommand: "set-video", randomCommand: "random-video", current: "", items: [] } }) })
  property string activeMode: "static"
  property int imageReloadNonce: 0
  property int pageSize: 16
  property int columns: 4
  property int currentPage: 0
  property int selectedInPage: 0
  property bool pendingShowPanel: false
  property var activeTab: root.tabForMode(root.activeMode)
  property var activeItems: activeTab.items || []
  property int pageCount: Math.max(1, Math.ceil(activeItems.length / pageSize))
  property var pageItems: activeItems.slice(currentPage * pageSize, currentPage * pageSize + pageSize)

  FileView {
    id: requestFile
    path: root.requestPath
    blockLoading: true
    watchChanges: true
    onFileChanged: requestReloadTimer.restart()
  }

  FileView {
    id: dataFile
    path: root.dataPath
    blockLoading: true
  }

  Timer {
    id: requestReloadTimer
    interval: 40
    repeat: false
    onTriggered: root.loadRequest(true)
  }

  Timer {
    id: dataLoadTimer
    interval: 40
    repeat: false
    onTriggered: {
      dataFile.path = root.dataPath
      dataFile.reload()
      root.loadData(root.pendingShowPanel)
    }
  }

  Component.onCompleted: {
    if (root.panelVisible)
      root.loadRequest(true)
  }

  function loadRequest(showPanel) {
    try {
      requestFile.reload()
      const requestText = requestFile.text()
      if (requestText && requestText.length > 0) {
        const request = JSON.parse(requestText)
        if (request.dataPath && request.dataPath.length > 0)
          root.dataPath = request.dataPath
      }
    } catch (error) {
      console.log("wallpaper picker failed to read request: " + error)
    }

    root.pendingShowPanel = showPanel
    dataLoadTimer.restart()
  }

  function loadData(showPanel) {
    if (root.dataPath.length === 0)
      return

    try {
      const text = dataFile.text()
      if (!text || text.length === 0)
        return

      const parsed = JSON.parse(text)
      if (!parsed.tabs) {
        const mode = parsed.mode === "video" ? "video" : "static"
        parsed.initialMode = mode
        parsed.tabs = ({})
        parsed.tabs[mode] = { title: parsed.title || (mode === "video" ? "Live wallpapers" : "Normal wallpapers"), applyCommand: parsed.applyCommand || (mode === "video" ? "set-video" : "set-static"), randomCommand: mode === "video" ? "random-video" : "random-static", current: parsed.current || "", items: parsed.items || [] }
        parsed.script = parsed.script || "orgm-hypr"
        parsed.scriptArgs = parsed.scriptArgs || ["wallpaper"]
      }
      root.data = parsed
      root.activeMode = parsed.initialMode === "video" ? "video" : "static"
      root.resetSelectionForActiveTab()
      if (showPanel)
        root.showPanel()
      root.warmCurrentPage()
    } catch (error) {
      console.log("wallpaper picker failed to read data: " + error)
    }
  }

  Process { id: applyProc }

  Process {
    id: warmPageProc
    stdout: StdioCollector {
      onStreamFinished: root.imageReloadNonce += 1
    }
  }

  function commandWithScriptArgs(args) {
    const script = root.data.script || "orgm-hypr"
    const scriptArgs = root.data.scriptArgs || (script === "orgm-hypr" ? ["wallpaper"] : [])
    return [script].concat(scriptArgs).concat(args)
  }

  function tabForMode(mode) {
    const tabs = root.data.tabs || ({})
    if (mode === "video" && tabs.video)
      return tabs.video
    if (tabs.static)
      return tabs.static
    return ({ title: mode === "video" ? "Live wallpapers" : "Normal wallpapers", applyCommand: mode === "video" ? "set-video" : "set-static", randomCommand: mode === "video" ? "random-video" : "random-static", current: "", items: [] })
  }

  function resetSelectionForActiveTab() {
    const current = root.activeTab.current || ""
    const index = Math.max(0, root.activeItems.findIndex(item => item.path === current))
    root.currentPage = Math.floor(index / root.pageSize)
    root.selectedInPage = index % root.pageSize
  }

  function setActiveMode(mode) {
    const nextMode = mode === "video" ? "video" : "static"
    if (nextMode === root.activeMode)
      return
    root.activeMode = nextMode
    root.resetSelectionForActiveTab()
    root.warmCurrentPage()
  }

  function warmCurrentPage() {
    warmPageProc.command = root.commandWithScriptArgs(["warm-page", root.activeMode, String(root.currentPage), String(root.pageSize)])
    warmPageProc.running = true
  }

  function showPanel() {
    root.panelVisible = true
    overlay.opacity = 1
    overlay.scale = 1
    grid.forceActiveFocus()
  }

  function hidePanel() {
    overlay.opacity = 0
    overlay.scale = 0.96
    closeTimer.start()
  }

  function changePage(delta) {
    const nextPage = Math.max(0, Math.min(root.pageCount - 1, root.currentPage + delta))
    if (nextPage === root.currentPage)
      return
    root.currentPage = nextPage
    root.selectedInPage = 0
    root.warmCurrentPage()
  }

  function moveSelection(delta) {
    if (root.pageItems.length === 0)
      return
    root.selectedInPage = Math.max(0, Math.min(root.pageItems.length - 1, root.selectedInPage + delta))
  }

  function selectedItem() {
    if (!root.pageItems || root.pageItems.length === 0)
      return null
    return root.pageItems[root.selectedInPage]
  }

  function handleKey(event) {
    if (event.key === Qt.Key_Escape) {
      root.hidePanel()
      event.accepted = true
    } else if (event.key === Qt.Key_Left) {
      root.moveSelection(-1)
      event.accepted = true
    } else if (event.key === Qt.Key_Right) {
      root.moveSelection(1)
      event.accepted = true
    } else if (event.key === Qt.Key_Up) {
      root.moveSelection(-root.columns)
      event.accepted = true
    } else if (event.key === Qt.Key_Down) {
      root.moveSelection(root.columns)
      event.accepted = true
    } else if (event.key === Qt.Key_PageUp) {
      root.changePage(-1)
      event.accepted = true
    } else if (event.key === Qt.Key_PageDown) {
      root.changePage(1)
      event.accepted = true
    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
      overlay.applySelected()
      event.accepted = true
    }
  }

  PanelWindow {
    id: win
    color: "transparent"
    visible: root.panelVisible
    exclusionMode: ExclusionMode.Ignore
    exclusiveZone: 0

    anchors {
      top: true
      bottom: true
      left: true
      right: true
    }

    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
    WlrLayershell.namespace: "wallpaper-picker"

    Rectangle {
      id: overlay
      width: 1180
      height: 720
      radius: 20
      color: "#dd000000"
      border.color: "#33494d64"
      border.width: 1
      anchors.centerIn: parent
      opacity: 0
      scale: 0.96

      Behavior on opacity { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
      Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }

      Component.onCompleted: if (root.panelVisible) root.showPanel()
      Keys.onPressed: event => root.handleKey(event)

      function applySelected() {
        const item = root.selectedItem()
        if (!item || !item.path)
          return
        applyProc.command = root.commandWithScriptArgs([root.activeTab.applyCommand || (root.activeMode === "video" ? "set-video" : "set-static"), item.path])
        applyProc.startDetached()
        root.hidePanel()
      }

      function applyRandom() {
        applyProc.command = root.commandWithScriptArgs([root.activeTab.randomCommand || (root.activeMode === "video" ? "random-video" : "random-static")])
        applyProc.startDetached()
        root.hidePanel()
      }

      Timer {
        id: closeTimer
        interval: 130
        repeat: false
        onTriggered: root.panelVisible = false
      }

      Column {
        anchors.fill: parent
        anchors.margins: 32
        spacing: 18

        Row {
          width: parent.width
          height: 40
          spacing: 12

          Text {
            text: "Wallpapers"
            color: "#cad3f5"
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: 22
            font.bold: true
            width: 190
            elide: Text.ElideRight
          }

          Rectangle {
            width: 100
            height: 32
            radius: 9
            color: root.activeMode === "static" ? "#33494d64" : "#22363a4f"
            border.color: root.activeMode === "static" ? "#8aadf4" : "#494d64"
            Text { anchors.centerIn: parent; text: "NORMAL"; color: root.activeMode === "static" ? "#8aadf4" : "#cad3f5"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 13; font.bold: true }
            MouseArea { anchors.fill: parent; onClicked: root.setActiveMode("static") }
          }

          Rectangle {
            width: 100
            height: 32
            radius: 9
            color: root.activeMode === "video" ? "#33494d64" : "#22363a4f"
            border.color: root.activeMode === "video" ? "#8aadf4" : "#494d64"
            Text { anchors.centerIn: parent; text: "LIVE"; color: root.activeMode === "video" ? "#8aadf4" : "#cad3f5"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 13; font.bold: true }
            MouseArea { anchors.fill: parent; onClicked: root.setActiveMode("video") }
          }

          Item { width: parent.width - 190 - 100 - 100 - pager.width - helper.width - 88; height: 1 }

          Text {
            id: pager
            text: (root.currentPage + 1) + " / " + root.pageCount
            color: "#8aadf4"
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: 14
            anchors.verticalCenter: parent.verticalCenter
          }

          Text {
            id: helper
            text: "Arrows select  PgUp/PgDn page  Enter apply  Esc close"
            color: "#6e738d"
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: 13
            anchors.verticalCenter: parent.verticalCenter
          }
        }

        GridView {
          id: grid
          width: parent.width
          height: 550
          cellWidth: 270
          cellHeight: 132
          clip: true
          focus: true
          model: root.pageItems
          interactive: false
          Keys.onPressed: event => root.handleKey(event)

          Text {
            anchors.centerIn: parent
            visible: root.activeItems.length === 0
            text: root.activeMode === "video" ? "No live wallpapers found" : "No normal wallpapers found"
            color: "#6e738d"
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: 18
          }

          delegate: Item {
            required property var modelData
            required property int index
            width: grid.cellWidth
            height: grid.cellHeight
            opacity: index === root.selectedInPage ? 1.0 : 0.72

            Behavior on opacity { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }

            Rectangle {
              anchors.fill: parent
              anchors.margins: 5
              radius: 12
              color: mouse.containsMouse || index === root.selectedInPage ? "#55363a4f" : "transparent"
              border.color: index === root.selectedInPage ? "#8aadf4" : "#33494d64"
              border.width: index === root.selectedInPage ? 2 : 1

              Behavior on color { ColorAnimation { duration: 120 } }

              Image {
                anchors.fill: parent
                anchors.margins: 8
                source: "file://" + modelData.thumb + "?v=" + root.imageReloadNonce
                fillMode: Image.PreserveAspectCrop
                asynchronous: true
                cache: false
                smooth: true
              }

              MouseArea {
                id: mouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: {
                  root.selectedInPage = index
                  overlay.applySelected()
                }
              }
            }
          }
        }

        Row {
          width: parent.width
          height: 30
          spacing: 10

          Rectangle {
            width: 74
            height: 28
            radius: 7
            color: root.currentPage > 0 ? "#22363a4f" : "transparent"
            border.color: root.currentPage > 0 ? "#8aadf4" : "#494d64"
            Text { anchors.centerIn: parent; text: "← Prev"; color: root.currentPage > 0 ? "#8aadf4" : "#494d64"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 13 }
            MouseArea { anchors.fill: parent; onClicked: root.changePage(-1) }
          }

          Rectangle {
            width: 74
            height: 28
            radius: 7
            color: root.currentPage < root.pageCount - 1 ? "#22363a4f" : "transparent"
            border.color: root.currentPage < root.pageCount - 1 ? "#8aadf4" : "#494d64"
            Text { anchors.centerIn: parent; text: "Next →"; color: root.currentPage < root.pageCount - 1 ? "#8aadf4" : "#494d64"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 13 }
            MouseArea { anchors.fill: parent; onClicked: root.changePage(1) }
          }

          Item { width: parent.width - 74 - 74 - 130 - 30; height: 1 }

          Rectangle {
            width: 130
            height: 28
            radius: 7
            color: "#22363a4f"
            border.color: "#a6da95"
            Text { anchors.centerIn: parent; text: "󰒟 Random"; color: "#a6da95"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 13; font.bold: true }
            MouseArea { anchors.fill: parent; onClicked: overlay.applyRandom() }
          }
        }
      }
    }
  }
}
