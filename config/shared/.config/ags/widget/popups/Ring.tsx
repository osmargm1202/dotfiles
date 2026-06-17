interface RingProps {
  percent: number
  label: string
  sublabel: string
  isCelsius?: boolean
}

const RADIUS = 32
const STROKE = 7
const SIZE = (RADIUS + STROKE) * 2 + 2

function colorClass(percent: number, isCelsius: boolean): string {
  const high = 80
  const med = isCelsius ? 65 : 60
  if (percent >= high) return "ring-red"
  if (percent >= med) return "ring-yellow"
  return "ring-green"
}

export default function Ring({ percent, label, sublabel, isCelsius = false }: RingProps) {
  const cls = colorClass(percent, isCelsius)
  const cx = SIZE / 2
  const cy = SIZE / 2

  return (
    <box className="ring-wrap" vertical>
      <drawingarea
        widthRequest={SIZE}
        heightRequest={SIZE}
        onDraw={(_, cr) => {
          // Background circle
          cr.setSourceRGBA(0.19, 0.20, 0.27, 1) // surface0
          cr.setLineWidth(STROKE)
          cr.arc(cx, cy, RADIUS, 0, 2 * Math.PI)
          cr.stroke()

          // Color based on percent
          const colors: Record<string, [number, number, number]> = {
            "ring-green":  [0.65, 0.89, 0.63],
            "ring-yellow": [0.98, 0.89, 0.69],
            "ring-red":    [0.95, 0.55, 0.66],
          }
          const [r, g, b] = colors[cls] ?? colors["ring-green"]
          cr.setSourceRGBA(r, g, b, 1)
          cr.setLineWidth(STROKE)
          cr.setLineCap(1) // ROUND

          // Arc from top (-π/2), clockwise by (percent/100 * 2π)
          const startAngle = -Math.PI / 2
          const endAngle = startAngle + (percent / 100) * 2 * Math.PI
          cr.arc(cx, cy, RADIUS, startAngle, endAngle)
          cr.stroke()
        }}
      />
      <label className="ring-value" label={`${percent}${isCelsius ? "°" : "%"}`} />
      <label className="ring-sublabel" label={sublabel} />
      <label className="ring-label" label={label} />
    </box>
  )
}
