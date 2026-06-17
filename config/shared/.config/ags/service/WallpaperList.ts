import { Variable } from "astal"
import GLib from "gi://GLib"

export interface WallpaperEntry {
  path: string
  name: string
  thumbPath: string | null
}

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"])
const VIDEO_EXTS = new Set([".mp4", ".mkv", ".webm"])

function scanDir(dirPath: string): WallpaperEntry[] {
  const entries: WallpaperEntry[] = []
  const dir = GLib.Dir.open(dirPath, 0)
  if (!dir) return entries
  let name: string | null
  while ((name = dir.read_name()) !== null) {
    const ext = name.substring(name.lastIndexOf(".")).toLowerCase()
    if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue
    const path = `${dirPath}/${name}`
    const thumbPath = VIDEO_EXTS.has(ext)
      ? `${GLib.get_home_dir()}/.local/state/orgm-wallpaper/thumb.jpg`
      : null
    entries.push({ path, name: name.replace(/\.[^.]+$/, ""), thumbPath })
  }
  return entries
}

const WALLPAPER_DIRS = [
  `${GLib.get_home_dir()}/.config/wallpapers`,
  `${GLib.get_home_dir()}/Pictures/Wallpapers`,
  `${GLib.get_home_dir()}/Pictures`,
].filter(d => GLib.file_test(d, GLib.FileTest.IS_DIR))

export const wallpaperList = Variable<WallpaperEntry[]>([]).poll(30000, () =>
  WALLPAPER_DIRS.flatMap(scanDir)
)

export function currentWallpaperPath(): string {
  try {
    const stateFile = `${GLib.get_home_dir()}/.local/state/orgm-wallpaper/path`
    const [ok, contents] = GLib.file_get_contents(stateFile)
    return ok ? new TextDecoder().decode(contents).trim() : ""
  } catch {
    return ""
  }
}
