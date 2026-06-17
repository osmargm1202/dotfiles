import { bind } from "astal"
import { exec } from "astal/process"
import { wallpaperList, currentWallpaperPath, WallpaperEntry } from "../../service/WallpaperList"

function WallpaperThumb({ entry }: { entry: WallpaperEntry }) {
  const currentPath = currentWallpaperPath()
  const isActive = entry.path === currentPath

  return (
    <button
      className={`wallpaper-thumb ${isActive ? "active" : ""}`}
      tooltipText={entry.name}
      onClicked={() => exec(`orgm-wallpaper set-static ${entry.path}`)}
    >
      <box vertical>
        <image
          file={entry.thumbPath ?? entry.path}
          widthRequest={90}
          heightRequest={56}
        />
        <label
          label={entry.name.slice(0, 12)}
          className="thumb-label"
          maxWidthChars={12}
          ellipsize={3}
        />
      </box>
    </button>
  )
}

export default function WallpaperMenu({ setup }: { setup?: (self: any) => void }) {
  const entries = bind(wallpaperList)

  return (
    <revealer
      className="wallpaper-revealer"
      revealChild={false}
      transitionType={3}
      transitionDuration={200}
      setup={setup}
    >
      <box className="wallpaper-panel" vertical>
        <label className="panel-title" label="WALLPAPER" />
        <scrollable
          widthRequest={320}
          heightRequest={220}
          hscrollbarPolicy={2}
        >
          <flowbox
            className="wallpaper-grid"
            columnSpacing={8}
            rowSpacing={8}
            maxChildrenPerLine={3}
            homogeneous
          >
            {entries.as(list =>
              list.map(entry => <WallpaperThumb entry={entry} />)
            )}
          </flowbox>
        </scrollable>
        <box className="wallpaper-actions" spacing={8}>
          <button className="action-btn" onClicked={() => exec("orgm-wallpaper random")}>
            🎲 Random
          </button>
          <button className="action-btn" onClicked={() => exec("hypr-random-wallpaper video")}>
            ▶ Video
          </button>
        </box>
      </box>
    </revealer>
  )
}
