/** Monday-to-Sunday tabs for a weekly plan, with today marked and an optional icon per day. */
import { useRef, type KeyboardEvent } from 'react'
import { dayDate, todayIndex } from '../../lib/week'
import { Icon, type IconName } from './Icon'

type Note = { text?: string; icon?: IconName }

export function DayTabs({ weekStart, value, onChange, note }: { weekStart: string; value: number; onChange: (day: number) => void; note?: (day: number) => Note | undefined }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  // Arrow keys move between days, as in any tab list.
  function onKey(e: KeyboardEvent, day: number) {
    const next = e.key === 'ArrowRight' ? (day + 1) % 7 : e.key === 'ArrowLeft' ? (day + 6) % 7 : null
    if (next === null) return
    e.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="card grid grid-cols-7 gap-1 p-1.5 sm:gap-1.5" role="tablist" aria-label="Day of the week">
      {Array.from({ length: 7 }, (_, day) => {
        const date = dayDate(weekStart, day)
        const active = day === value
        const today = day === todayIndex()
        const extra = note?.(day)
        return (
          <button
            key={day} ref={(el) => { refs.current[day] = el }}
            type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1}
            onClick={() => onChange(day)} onKeyDown={(e) => onKey(e, day)}
            className={`relative flex flex-col items-center rounded-xl px-0.5 py-2 transition ${active ? 'btn-primary text-white shadow-md' : 'text-heading hover:bg-ink-2'}`}
          >
            <span className={`text-[11px] font-semibold uppercase ${active ? 'text-indigo-100' : 'text-muted'}`}>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
            <span className="text-lg font-extrabold leading-tight">{date.getDate()}</span>
            {extra?.icon
              ? <Icon name={extra.icon} className={`mt-0.5 h-3.5 w-3.5 ${active ? 'text-white' : 'text-muted'}`} />
              : <span className="mt-0.5 h-3.5" />}
            {today && <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-mint'}`} aria-label="Today" />}
            {extra?.text && <span className="sr-only">{extra.text}</span>}
          </button>
        )
      })}
    </div>
  )
}
