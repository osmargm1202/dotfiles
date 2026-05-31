import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick

ShellRoot {
  id: root

  property string home: Quickshell.env("HOME") || ""
  property string cacheHome: Quickshell.env("XDG_CACHE_HOME") || (home + "/.cache")
  property string stateHome: Quickshell.env("XDG_STATE_HOME") || (home + "/.local/state")
  property string cachePath: Quickshell.env("ORGM_CALENDAR_CACHE") || (cacheHome + "/orgm-calendar/events.json")
  property string requestPath: Quickshell.env("ORGM_CALENDAR_UI_REQUEST") || (stateHome + "/orgm-calendar/ui-request.json")
  property bool panelVisible: (Quickshell.env("ORGM_CALENDAR_SHOW") || "") === "1"
  property var cache: ({ schemaVersion: 1, status: ({ state: "missing", stale: false, message: "Calendar cache has not been created yet" }), events: [] })
  property string cacheError: ""
  property date today: new Date()
  property date visibleMonth: new Date(today.getFullYear(), today.getMonth(), 1)
  property string selectedDate: root.dateKey(today)
  property string lastRequestId: ""
  property var weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  property var monthCells: root.buildMonthCells()
  property var selectedEvents: root.eventsForDate(root.selectedDate)

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

  Timer { id: cacheReloadTimer; interval: 60; repeat: false; onTriggered: root.loadCache() }
  Timer { id: requestReloadTimer; interval: 40; repeat: false; onTriggered: root.loadRequest() }

  Component.onCompleted: {
    root.loadCache()
    if (root.panelVisible)
      root.showPanel()
  }

  Process { id: actionProc }

  function runAction(args) {
    actionProc.command = ["orgm-calendar"].concat(args)
    actionProc.startDetached()
  }

  function loadCache() {
    try {
      cacheFile.path = root.cachePath
      cacheFile.reload()
      const text = cacheFile.text()
      if (!text || text.length === 0) {
        root.cacheError = "Cache is empty"
        return
      }
      const parsed = JSON.parse(text)
      parsed.events = parsed.events || []
      parsed.status = parsed.status || ({ state: "ok", stale: false, message: "" })
      root.cache = parsed
      root.cacheError = ""
      root.monthCells = root.buildMonthCells()
      root.selectedEvents = root.eventsForDate(root.selectedDate)
    } catch (error) {
      root.cacheError = "parse_error: " + error
      root.cache = ({ schemaVersion: 1, status: ({ state: "parse_error", stale: true, message: "Could not read calendar cache" }), events: [] })
      root.monthCells = root.buildMonthCells()
      root.selectedEvents = []
      console.log("calendar failed to read cache: " + error)
    }
  }

  function loadRequest() {
    try {
      requestFile.reload()
      const text = requestFile.text()
      let request = ({ action: "toggle" })
      if (text && text.length > 0)
        request = JSON.parse(text)
      const id = String(request.id || request.nonce || request.timestamp || request.requestedAt || text)
      if (id === root.lastRequestId)
        return
      root.lastRequestId = id
      if (request.cachePath && request.cachePath.length > 0)
        root.cachePath = request.cachePath
      const action = request.action || "toggle"
      if (action === "show" || action === "open")
        root.showPanel()
      else if (action === "hide")
        root.hidePanel()
      else
        root.panelVisible ? root.hidePanel() : root.showPanel()
      root.loadCache()
    } catch (error) {
      console.log("calendar failed to read ui-request.json: " + error)
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

  function dateKey(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return y + "-" + m + "-" + d
  }

  function monthTitle() {
    return root.visibleMonth.toLocaleDateString(Qt.locale(), "MMMM yyyy")
  }

  function buildMonthCells() {
    const start = new Date(root.visibleMonth.getFullYear(), root.visibleMonth.getMonth(), 1)
    const mondayOffset = (start.getDay() + 6) % 7
    const cursor = new Date(start)
    cursor.setDate(start.getDate() - mondayOffset)
    const cells = []
    for (let i = 0; i < 42; i++) {
      const key = root.dateKey(cursor)
      const count = root.eventsForDate(key).length
      cells.push({ date: key, day: cursor.getDate(), currentMonth: cursor.getMonth() === root.visibleMonth.getMonth(), today: key === root.dateKey(root.today), selected: key === root.selectedDate, eventCount: count })
      cursor.setDate(cursor.getDate() + 1)
    }
    return cells
  }

  function eventsForDate(key) {
    const events = root.cache.events || []
    return events.filter(event => (event.startDate || "") <= key && (event.endDate || event.startDate || "") >= key)
  }

  function selectDate(key) {
    root.selectedDate = key
    root.selectedEvents = root.eventsForDate(key)
    root.monthCells = root.buildMonthCells()
  }

  function changeMonth(delta) {
    root.visibleMonth = new Date(root.visibleMonth.getFullYear(), root.visibleMonth.getMonth() + delta, 1)
    root.monthCells = root.buildMonthCells()
  }

  function moveSelected(days) {
    const parts = root.selectedDate.split("-")
    const next = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    next.setDate(next.getDate() + days)
    root.visibleMonth = new Date(next.getFullYear(), next.getMonth(), 1)
    root.selectDate(root.dateKey(next))
  }

  function statusText() {
    if (root.cacheError === "Cache is empty")
      return "Sin caché · Sync"
    if (root.cacheError.length > 0)
      return "Error de caché · Sync"
    const status = root.cache.status || ({})
    if (status.message && status.message.length > 0)
      return status.message
    if (status.stale)
      return "Calendar data is stale"
    if (status.state === "empty")
      return "No events in cache"
    return "Last refresh: " + (root.cache.lastSuccessAt || "not yet")
  }

  function statusColor() {
    const state = (root.cache.status || ({})).state || "ok"
    if (root.cacheError.length > 0 || state.indexOf("error") >= 0)
      return "#ed8796"
    if ((root.cache.status || ({})).stale)
      return "#eed49f"
    return "#a6da95"
  }

  function openSelected() {
    if (root.selectedEvents.length > 0)
      root.runAction(["open-event", root.selectedEvents[0].id || root.selectedEvents[0].stableKey])
    else
      root.runAction(["open-web", root.selectedDate])
  }

  function handleKey(event) {
    if (event.key === Qt.Key_Escape) {
      root.hidePanel(); event.accepted = true
    } else if (event.key === Qt.Key_Left) {
      root.moveSelected(-1); event.accepted = true
    } else if (event.key === Qt.Key_Right) {
      root.moveSelected(1); event.accepted = true
    } else if (event.key === Qt.Key_Up) {
      root.moveSelected(-7); event.accepted = true
    } else if (event.key === Qt.Key_Down) {
      root.moveSelected(7); event.accepted = true
    } else if (event.key === Qt.Key_PageUp) {
      root.changeMonth(-1); event.accepted = true
    } else if (event.key === Qt.Key_PageDown) {
      root.changeMonth(1); event.accepted = true
    } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
      root.openSelected(); event.accepted = true
    }
  }

  PanelWindow {
    id: win
    color: "transparent"
    visible: root.panelVisible
    exclusionMode: ExclusionMode.Ignore
    exclusiveZone: 0

    anchors { top: true; bottom: true; left: true; right: true }

    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
    WlrLayershell.namespace: "orgm-calendar"

    Rectangle {
      id: overlay
      width: 920
      height: 640
      radius: 22
      color: "#e611111b"
      border.color: "#33494d64"
      border.width: 1
      anchors.centerIn: parent
      opacity: 0
      scale: 0.96
      focus: true
      Keys.onPressed: event => root.handleKey(event)

      Behavior on opacity { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
      Behavior on scale { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
      Component.onCompleted: if (root.panelVisible) root.showPanel()

      Timer { id: closeTimer; interval: 130; repeat: false; onTriggered: root.panelVisible = false }

      Column {
        anchors.fill: parent
        anchors.margins: 28
        spacing: 14

        Row {
          width: parent.width
          height: parent.height - footer.height - parent.spacing
          spacing: 22

          Column {
            width: 552
            height: parent.height
            spacing: 14

            Row {
            width: parent.width
            height: 42
            spacing: 10

            Text { text: "Calendar"; color: "#cad3f5"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 24; font.bold: true; width: 150; elide: Text.ElideRight }
            Text { text: root.monthTitle(); color: "#8aadf4"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 18; font.bold: true; width: 200; anchors.verticalCenter: parent.verticalCenter }

            Rectangle { width: 34; height: 30; radius: 8; color: "#22363a4f"; border.color: "#494d64"; Text { anchors.centerIn: parent; text: "‹"; color: "#cad3f5"; font.pixelSize: 20 } MouseArea { anchors.fill: parent; onClicked: root.changeMonth(-1) } }
            Rectangle { width: 34; height: 30; radius: 8; color: "#22363a4f"; border.color: "#494d64"; Text { anchors.centerIn: parent; text: "›"; color: "#cad3f5"; font.pixelSize: 20 } MouseArea { anchors.fill: parent; onClicked: root.changeMonth(1) } }
            Rectangle { width: 86; height: 30; radius: 8; color: "#22363a4f"; border.color: "#a6da95"; Text { anchors.centerIn: parent; text: "Sync"; color: "#a6da95"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 13; font.bold: true } MouseArea { anchors.fill: parent; onClicked: root.runAction(["sync"]) } }
          }

          Grid {
            width: parent.width
            columns: 7
            spacing: 5
            Repeater {
              model: root.weekdays
              delegate: Text { required property string modelData; width: 72; height: 22; text: modelData; color: "#6e738d"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 12; horizontalAlignment: Text.AlignHCenter }
            }
            Repeater {
              model: root.monthCells
              delegate: Rectangle {
                required property var modelData
                width: 72
                height: 60
                radius: 12
                color: modelData.selected ? "#33494d64" : (dayMouse.containsMouse ? "#22363a4f" : "transparent")
                border.color: modelData.selected ? "#8aadf4" : (modelData.today ? "#a6da95" : "#33494d64")
                border.width: modelData.selected || modelData.today ? 2 : 1
                opacity: modelData.currentMonth ? 1 : 0.42

                Behavior on color { ColorAnimation { duration: 120 } }

                Text { anchors.top: parent.top; anchors.left: parent.left; anchors.margins: 9; text: modelData.day; color: modelData.today ? "#a6da95" : "#cad3f5"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 14; font.bold: modelData.selected || modelData.today }
                Rectangle { width: modelData.eventCount > 9 ? 30 : 22; height: 18; radius: 9; visible: modelData.eventCount > 0; color: "#8aadf4"; anchors.right: parent.right; anchors.bottom: parent.bottom; anchors.margins: 7; Text { anchors.centerIn: parent; text: modelData.eventCount; color: "#11111b"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 11; font.bold: true } }
                Row { visible: modelData.eventCount > 0; anchors.left: parent.left; anchors.bottom: parent.bottom; anchors.margins: 9; spacing: 3; Repeater { model: Math.min(3, modelData.eventCount); delegate: Rectangle { width: 5; height: 5; radius: 3; color: "#f5bde6" } } }
                MouseArea { id: dayMouse; anchors.fill: parent; hoverEnabled: true; onClicked: root.selectDate(modelData.date) }
              }
            }
          }

          Rectangle {
            width: parent.width
            height: 42
            radius: 11
            color: "#1e363a4f"
            border.color: root.statusColor()
            Text { anchors.fill: parent; anchors.margins: 10; text: root.statusText(); color: root.statusColor(); font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 12; elide: Text.ElideRight; verticalAlignment: Text.AlignVCenter }
          }
        }

        Column {
          width: parent.width - 574
          height: parent.height
          spacing: 12

          Text { text: "Agenda"; color: "#cad3f5"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 22; font.bold: true }
          Text { text: root.selectedDate + "  •  Win+Shift+C toggles"; color: "#8aadf4"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 13 }

          Row {
            width: parent.width
            height: 31
            spacing: 8
            Rectangle { width: 78; height: 30; radius: 8; color: "#22363a4f"; border.color: "#a6da95"; Text { anchors.centerIn: parent; text: "Add"; color: "#a6da95"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 12; font.bold: true } MouseArea { anchors.fill: parent; onClicked: root.runAction(["add", root.selectedDate]) } }
            Rectangle { width: 94; height: 30; radius: 8; color: "#22363a4f"; border.color: "#8aadf4"; Text { anchors.centerIn: parent; text: "Open day"; color: "#8aadf4"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 12; font.bold: true } MouseArea { anchors.fill: parent; onClicked: root.runAction(["open-web", root.selectedDate]) } }
            Rectangle { width: 96; height: 30; radius: 8; color: "#22363a4f"; border.color: "#f5bde6"; Text { anchors.centerIn: parent; text: "Open event"; color: "#f5bde6"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 12; font.bold: true } MouseArea { anchors.fill: parent; onClicked: root.openSelected() } }
          }

          Rectangle {
            width: parent.width
            height: 414
            radius: 16
            color: "#22363a4f"
            border.color: "#33494d64"
            clip: true

            Text {
              anchors.centerIn: parent
              visible: root.selectedEvents.length === 0
              width: parent.width - 40
              text: root.cacheError === "Cache is empty" ? "No hay eventos cargados. Pulsa Sync." : (root.cacheError.length > 0 ? "No se pudo leer el caché. Pulsa Sync o revisa status." : "No events for this day. Breathe.")
              color: "#6e738d"
              font.family: "JetBrainsMono Nerd Font"
              font.pixelSize: 15
              horizontalAlignment: Text.AlignHCenter
              wrapMode: Text.WordWrap
            }

            ListView {
              anchors.fill: parent
              anchors.margins: 12
              spacing: 10
              clip: true
              model: root.selectedEvents
              delegate: Rectangle {
                required property var modelData
                width: ListView.view.width
                height: Math.max(70, titleText.paintedHeight + metaText.paintedHeight + 32)
                radius: 12
                color: "#2b363a4f"
                border.color: modelData.htmlLink && modelData.htmlLink.length > 0 ? "#8aadf4" : "#494d64"

                Column {
                  anchors.fill: parent
                  anchors.margins: 12
                  spacing: 5
                  Text { id: titleText; text: modelData.title || "Untitled event"; color: "#cad3f5"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 14; font.bold: true; width: parent.width; wrapMode: Text.WordWrap }
                  Text { id: metaText; text: (modelData.allDay ? "All day" : ((modelData.start || "").slice(11, 16) + "–" + (modelData.end || "").slice(11, 16))) + (modelData.calendarName ? "  •  " + modelData.calendarName : ""); color: "#a5adcb"; font.family: "JetBrainsMono Nerd Font"; font.pixelSize: 12; width: parent.width; elide: Text.ElideRight }
                }
                MouseArea { anchors.fill: parent; hoverEnabled: true; onClicked: root.runAction(["open-event", modelData.id || modelData.stableKey]) }
              }
            }
          }

          }
        }

        Rectangle {
          id: footer
          width: parent.width
          height: 34
          radius: 9
          color: "#1e363a4f"
          border.color: "#494d64"
          Text {
            anchors.centerIn: parent
            width: parent.width - 28
            text: "Esc close · Arrows select · Enter open · PgUp/PgDn month"
            color: "#6e738d"
            font.family: "JetBrainsMono Nerd Font"
            font.pixelSize: 11
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
          }
        }
      }
    }
  }
}
