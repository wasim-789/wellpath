/** Monday-to-Sunday tabs for a weekly plan, with today marked. */
import { dayDate, todayIndex } from '../../lib/week'

export function DayTabs({ weekStart, value, onChange, note }: { weekStart: string; value: number; onChange: (day: number) => void; note?: (day: number) => string | undefined }) {
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist" aria-label="Day of the week">
      {Array.from({ length: 7 }, (_, day) => {
        const date = dayDate(weekStart, day)
        const active = day === value
        const extra = day === todayIndex() ? 'Today' : note?.(day)
        return (
          <button
            key={day} type="button" role="tab" aria-selected={active} onClick={() => onChange(day)}
            className={`rounded-xl border px-1 py-2 text-center transition ${active ? 'border-violet bg-white shadow-sm' : 'border-line bg-white/60 hover:bg-white'}`}
          >
            <span className={`block text-xs font-semibold ${active ? 'text-violet' : 'text-muted'}`}>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className="block text-lg font-bold text-heading">{date.getDate()}</span>
            {extra && <span className={`block text-[10px] font-semibold uppercase ${extra === 'Today' ? 'text-mint' : 'text-muted'}`}>{extra}</span>}
          </button>
        )
      })}
    </div>
  )
}
