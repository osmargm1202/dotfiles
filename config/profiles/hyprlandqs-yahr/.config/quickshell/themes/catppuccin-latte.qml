// ThemeManager.qml - Catppuccin Latte Theme
pragma Singleton
import QtQuick

QtObject {
    id: themeManager

    property string currentTheme: "catppuccin-latte"

    // Catppuccin Latte Theme Colors
    property color accentBlue: "#1e66f5"
    property color accentPurple: "#8839ef"
    property color accentRed: "#d20f39"
    property color accentMaroon: "#e64553"
    property color accentYellow: "#df8e1d"
    property color accentGreen: "#40a02b"
    property color accentOrange: "#fe640b"
    property color accentPink: "#ea76cb"
    property color accentCyan: "#04a5e5"
    property color accentTeal: "#179299"

    property color fgPrimary: "#4c4f69"
    property color fgSecondary: "#5c5f77"
    property color fgTertiary: "#6c6f85"

    property color bgBase: "#eff1f5"
    property color bgMantle: "#e6e9ef"
    property color bgCrust: "#dce0e8"

    property color surface0: "#ccd0da"
    property color surface1: "#bcc0cc"
    property color surface2: "#acb0be"

    property color border0: "#9ca0b0"
    property color border1: "#8c8fa1"
    property color border2: "#7c7f93"

    property real barOpacity: 0.90
    property color bgBaseAlpha: Qt.rgba(bgBase.r, bgBase.g, bgBase.b, barOpacity)

    property int fontSizeClock: 14
    property int fontSizeWorkspace: 14
    property int fontSizeUpdates: 14
    property int fontSizeIcon: 16
    property int fontSizeLargeIcon: 24
}
