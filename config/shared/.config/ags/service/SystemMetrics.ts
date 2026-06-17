import { Variable } from "astal"
import GLib from "gi://GLib"

export interface Metrics {
  cpuPercent: number
  cpuTempC: number
  gpuPercent: number
  gpuTempC: number
  ramPercent: number
  ramUsedGB: number
  swapPercent: number
  swapUsedGB: number
  ssdPercent: number
}

function readFile(path: string): string {
  try {
    const [ok, contents] = GLib.file_get_contents(path)
    return ok ? new TextDecoder().decode(contents) : ""
  } catch {
    return ""
  }
}

let prevIdle = 0
let prevTotal = 0

function parseCPUPercent(): number {
  const stat = readFile("/proc/stat")
  const line = stat.split("\n")[0]
  const nums = line.replace("cpu", "").trim().split(/\s+/).map(Number)
  const idle = nums[3] + nums[4]
  const total = nums.reduce((a, b) => a + b, 0)
  const diffIdle = idle - prevIdle
  const diffTotal = total - prevTotal
  prevIdle = idle
  prevTotal = total
  if (diffTotal === 0) return 0
  return Math.round((1 - diffIdle / diffTotal) * 100)
}

function parseCPUTemp(): number {
  for (let i = 0; i < 10; i++) {
    const val = readFile(`/sys/class/thermal/thermal_zone${i}/temp`)
    if (val.trim()) return Math.round(parseInt(val.trim()) / 1000)
  }
  return 0
}

function parseMemInfo(): { ramPercent: number; ramUsedGB: number; swapPercent: number; swapUsedGB: number } {
  const lines = readFile("/proc/meminfo").split("\n")
  const get = (key: string) => {
    const line = lines.find(l => l.startsWith(key))
    return line ? parseInt(line.split(/\s+/)[1]) : 0
  }
  const totalRam = get("MemTotal:")
  const freeRam = get("MemAvailable:")
  const totalSwap = get("SwapTotal:")
  const freeSwap = get("SwapFree:")
  const usedRam = totalRam - freeRam
  const usedSwap = totalSwap - freeSwap
  return {
    ramPercent: totalRam ? Math.round((usedRam / totalRam) * 100) : 0,
    ramUsedGB: Math.round(usedRam / 1024 / 1024),
    swapPercent: totalSwap ? Math.round((usedSwap / totalSwap) * 100) : 0,
    swapUsedGB: Math.round(usedSwap / 1024 / 1024),
  }
}

function parseGPU(): { percent: number; tempC: number } {
  try {
    const [, out] = GLib.spawn_command_line_sync(
      "nvidia-smi --query-gpu=utilization.gpu,temperature.gpu --format=csv,noheader,nounits"
    )
    const line = new TextDecoder().decode(out).trim()
    if (line) {
      const [util, temp] = line.split(",").map(s => parseInt(s.trim()))
      return { percent: util || 0, tempC: temp || 0 }
    }
  } catch {}
  const busyPath = "/sys/class/drm/card0/device/gpu_busy_percent"
  const tempPath = "/sys/class/drm/card0/device/hwmon/hwmon0/temp1_input"
  const percent = parseInt(readFile(busyPath).trim()) || 0
  const tempC = Math.round(parseInt(readFile(tempPath).trim()) / 1000) || 0
  return { percent, tempC }
}

function parseSSD(): number {
  try {
    const [, out] = GLib.spawn_command_line_sync("df / --output=pcent")
    const line = new TextDecoder().decode(out).trim().split("\n")[1]
    return parseInt(line.replace("%", "").trim()) || 0
  } catch {
    return 0
  }
}

export function metricsColor(percent: number, isCelsius = false): string {
  const high = isCelsius ? 80 : 80
  const med = isCelsius ? 65 : 60
  if (percent >= high) return "@red"
  if (percent >= med) return "@yellow"
  return "@green"
}

export function ringOffset(percent: number, radius = 32): number {
  const circumference = 2 * Math.PI * radius
  return circumference * (1 - Math.max(0, Math.min(100, percent)) / 100)
}

export const metrics = Variable<Metrics>({
  cpuPercent: 0, cpuTempC: 0,
  gpuPercent: 0, gpuTempC: 0,
  ramPercent: 0, ramUsedGB: 0,
  swapPercent: 0, swapUsedGB: 0,
  ssdPercent: 0,
}).poll(2000, () => {
  const mem = parseMemInfo()
  const gpu = parseGPU()
  return {
    cpuPercent: parseCPUPercent(),
    cpuTempC: parseCPUTemp(),
    gpuPercent: gpu.percent,
    gpuTempC: gpu.tempC,
    ...mem,
    ssdPercent: parseSSD(),
  }
})
