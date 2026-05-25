import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick

ShellRoot {
  id: root

  property string home: Quickshell.env("HOME") || ""
  property string stateHome: Quickshell.env("XDG_STATE_HOME") || (home + "/.local/state")
  property string cachePath: Quickshell.env("ORGM_HELPER_CACHE") || (stateHome + "/orgm-helper/keybindings.json")
  property string requestPath: Quickshell.env("ORGM_HELPER_REQUEST") || (stateHome + "/orgm-helper/keyhelper-request.json")
  property real scaleFactor: root.parseScale(Quickshell.env("HELPER_SCALE") || "1.00")
  property bool panelVisible: (Quickshell.env("ORGM_HELPER_SHOW") || "") === "1"
  property var data: ({ schemaVersion: 1, defaultCategory: "launchers", categories: [] })
  property string activeCategory: "launchers"
  property string errorText: ""
  property string lastRequestId: ""

  FileView {
    id: cacheFile
    path: root.cachePath
    blockLoading: true
    watchChanges: true
    onFileChanged: cacheReloadTimer.restart()
  }

  FileView {
    id: requestFile
    path: root.requestPath
    blockLoading: true
    watchChanges: true
    onFileChanged: requestReloadTimer.restart()
  }

  Timer { id: cacheReloadTimer; interval: 50; repeat: false; onTriggered: root.loadCache() }
  Timer { id: requestReloadTimer; interval: 40; repeat: false; onTriggered: root.loadRequest() }
  Timer { id: closeTimer; interval: 130; repeat: false; onTriggered: root.panelVisible = false }

  Component.onCompleted: {
    root.loadCache()
    if (root.panelVisible)
      root.showPanel()
  }

  function parseScale(value) {
    const parsed = Number(value)
    if (!isFinite(parsed) || parsed <= 0)
      return 1.0
    return Math.max(0.75, Math.min(1.75, parsed))
  }

  function unit(value) {
    return Math.round(value * root.scaleFactor)
  }

  function categories() {
    return root.data.categories || []
  }

  function activeEntries() {
    for (const cat of root.categories()) {
      if (cat.id === root.activeCategory)
        return cat.entries || []
    }
    return []
  }

  function activeCategoryTitle() {
    for (const cat of root.categories()) {
      if (cat.id === root.activeCategory)
        return (cat.icon || "") + " " + cat.title
    }
    return "Atajos"
  }

  function loadCache() {
    try {
      cacheFile.path = root.cachePath
      cacheFile.reload()
      const text = cacheFile.text()
      if (!text || text.length === 0) {
        root.errorText = "No helper cache found. Right-click ? to refresh."
        return
      }
      const parsed = JSON.parse(text)
      parsed.categories = parsed.categories || []
      root.data = parsed
      root.activeCategory = parsed.defaultCategory || (parsed.categories[0] ? parsed.categories[0].id : "")
      root.errorText = ""
    } catch (error) {
      root.errorText = "Could not read helper cache: " + error
    }
  }

  function loadRequest() {
    try {
      requestFile.path = root.requestPath
      requestFile.reload()
      const text = requestFile.text()
      const request = text && text.length > 0 ? JSON.parse(text) : ({ action: "toggle" })
      const id = String(request.id || request.nonce || request.timestamp || request.requestedAt || text)
      if (id === root.lastRequestId)
        return
      root.lastRequestId = id
      if (request.cachePath && request.cachePath.length > 0)
        root.cachePath = request.cachePath
      if (request.action === "show" || request.action === "open")
        root.showPanel()
      else if (request.action === "hide")
        root.hidePanel()
      else
        root.panelVisible ? root.hidePanel() : root.showPanel()
      root.loadCache()
    } catch (error) {
      root.panelVisible ? root.hidePanel() : root.showPanel()
    }
  }

  function showPanel() {
    root.panelVisible = true
    overlay.opacity = 1
    overlay.scale = 1
    overlay.forceActiveFocus()
  }

  function hidePanel() {
    overlay.opacity = 0
    overlay.scale = 0.96
    closeTimer.start()
  }

  PanelWindow {
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
    WlrLayershell.namespace: "orgm-keyhelper"

    Rectangle {
      id: overlay
      width: root.unit(980)
      height: root.unit(620)
      radius: root.unit(22)
      color: "#e611111b"
      border.color: "#33494d64"
      border.width: 1
      anchors.centerIn: parent
      opacity: 0
      scale: 0.96
      focus: true

      Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape) {
          root.hidePanel()
          event.accepted = true
        }
      }

      Behavior on opacity { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
      Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }

      Column {
        anchors.fill: parent
        anchors.margins: root.unit(24)
        spacing: root.unit(16)

        Row {
          width: parent.width
          height: root.unit(34)
          spacing: root.unit(12)

          Text {
            text: "Atajos Hyprland"
            color: "#cad3f5"
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: root.unit(24)
            font.bold: true
            width: root.unit(260)
            elide: Text.ElideRight
          }

          Item { width: Math.max(0, parent.width - root.unit(260) - helper.width - root.unit(12)); height: 1 }

          Text {
            id: helper
            text: "Win+/ · Esc cierra"
            color: "#a6adc8"
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: root.unit(13)
            anchors.verticalCenter: parent.verticalCenter
          }
        }

        Text {
          visible: root.errorText.length > 0
          text: root.errorText
          color: "#ed8796"
          font.family: "JetBrainsMono Nerd Font"
          font.pixelSize: root.unit(15)
          wrapMode: Text.WordWrap
          width: parent.width
        }

        Row {
          visible: root.errorText.length === 0
          spacing: root.unit(18)
          width: parent.width
          height: root.unit(520)

          Rectangle {
            width: root.unit(210)
            height: parent.height
            radius: root.unit(14)
            color: "#181825"
            border.color: "#313244"

            Column {
              anchors.fill: parent
              anchors.margins: root.unit(10)
              spacing: root.unit(8)

              Repeater {
                model: root.categories()

                delegate: Rectangle {
                  width: parent.width
                  height: root.unit(42)
                  radius: root.unit(10)
                  color: modelData.id === root.activeCategory ? "#313244" : "transparent"

                  Text {
                    anchors.fill: parent
                    anchors.leftMargin: root.unit(12)
                    anchors.rightMargin: root.unit(12)
                    verticalAlignment: Text.AlignVCenter
                    text: (modelData.icon || "") + "  " + modelData.title
                    color: "#cad3f5"
                    font.family: "JetBrainsMono Nerd Font"
                    font.pixelSize: root.unit(14)
                    elide: Text.ElideRight
                  }

                  MouseArea { anchors.fill: parent; onClicked: root.activeCategory = modelData.id }
                }
              }
            }
          }

          Column {
            width: parent.width - root.unit(228)
            height: parent.height
            spacing: root.unit(10)

            Text {
              text: root.activeCategoryTitle()
              color: "#8aadf4"
              font.family: "JetBrainsMono Nerd Font"
              font.pixelSize: root.unit(18)
              font.bold: true
              width: parent.width
              elide: Text.ElideRight
            }

            Repeater {
              model: root.activeEntries()

              delegate: Rectangle {
                width: parent.width
                height: root.unit(54)
                radius: root.unit(12)
                color: "#181825"
                border.color: "#313244"

                Text {
                  x: root.unit(16)
                  width: parent.width - shortcut.width - root.unit(48)
                  anchors.verticalCenter: parent.verticalCenter
                  text: modelData.description
                  color: "#cad3f5"
                  font.family: "JetBrainsMono Nerd Font"
                  font.pixelSize: root.unit(15)
                  elide: Text.ElideRight
                }

                Text {
                  id: shortcut
                  anchors.right: parent.right
                  anchors.rightMargin: root.unit(16)
                  anchors.verticalCenter: parent.verticalCenter
                  text: modelData.key
                  color: "#89b4fa"
                  font.family: "JetBrainsMono Nerd Font"
                  font.pixelSize: root.unit(14)
                  font.bold: true
                }
              }
            }
          }
        }
      }
    }
  }
}
