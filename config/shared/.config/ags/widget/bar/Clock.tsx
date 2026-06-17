import { Variable, GLib } from "astal"

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                   "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]

const time = Variable("").poll(1000, () => {
  const now = GLib.DateTime.new_now_local()
  const h = now.get_hour().toString().padStart(2, "0")
  const m = now.get_minute().toString().padStart(2, "0")
  return `${h}:${m}`
})

const date = Variable("").poll(60000, () => {
  const now = GLib.DateTime.new_now_local()
  const day = DAYS_ES[now.get_day_of_week() % 7]
  const d = now.get_day_of_month()
  const month = MONTHS_ES[now.get_month() - 1]
  return `${day} ${d} ${month}`
})

export default function Clock() {
  return (
    <box className="clock" vertical={false}>
      <label className="clock-date" label={date()} />
      <label className="clock-time" label={time()} />
      <label className="clock-date" label={date()} />
    </box>
  )
}
