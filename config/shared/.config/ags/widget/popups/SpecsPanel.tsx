import { bind } from "astal"
import { metrics } from "../../service/SystemMetrics"
import Ring from "./Ring"

export default function SpecsPanel({ setup }: { setup?: (self: any) => void }) {
  const m = bind(metrics)

  return (
    <revealer
      className="specs-revealer"
      revealChild={false}
      transitionType={3}
      transitionDuration={200}
      setup={setup}
    >
      <box className="specs-panel" vertical={false} spacing={16}>
        {m.as(data => (
          <>
            <Ring percent={data.cpuPercent} label="CPU" sublabel="uso" />
            <Ring percent={data.cpuTempC} label="CPU" sublabel="temp" isCelsius />
            <Ring percent={data.gpuPercent} label="GPU" sublabel="uso" />
            <Ring percent={data.gpuTempC} label="GPU" sublabel="temp" isCelsius />
            <Ring percent={data.ramPercent} label="RAM" sublabel={`${data.ramUsedGB}G`} />
            <Ring percent={data.swapPercent} label="SWAP" sublabel={`${data.swapUsedGB}G`} />
            <Ring percent={data.ssdPercent} label="SSD" sublabel="uso" />
          </>
        ))}
      </box>
    </revealer>
  )
}
