// ThemeManager.qml - Catppuccin Macchiato Theme
pragma Singleton
import QtQuick

QtObject {
    id: themeManager

    property string currentTheme: "catppuccin-macchiato"

    // Catppuccin Macchiato Theme Colors
    property color accentBlue: "#8aadf4"
    property color accentPurple: "#c6a0f6"
    property color accentRed: "#ed8796"
    property color accentMaroon: "#ee99a0"
    property color accentYellow: "#eed49f"
    property color accentGreen: "#a6da95"
    property color accentOrange: "#f5a97f"
    property color accentPink: "#f5bde6"
    property color accentCyan: "#91d7e3"
    property color accentTeal: "#8bd5ca"

    property color fgPrimary: "#cad3f5"
    property color fgSecondary: "#b8c0e0"
    property color fgTertiary: "#a5adcb"

    property color bgBase: "#24273a"
    property color bgMantle: "#1e2030"
    property color bgCrust: "#181926"

    property color surface0: "#363a4f"
    property color surface1: "#494d64"
    property color surface2: "#5b6078"

    property color border0: "#6e738d"
    property color border1: "#8087a2"
    property color border2: "#939ab7"

    property real barOpacity: 0.85
    property color bgBaseAlpha: Qt.rgba(bgBase.r, bgBase.g, bgBase.b, barOpacity)

    property int fontSizeClock: 14
    property int fontSizeWorkspace: 14
    property int fontSizeUpdates: 14
    property int fontSizeIcon: 16
    property int fontSizeLargeIcon: 24
}
