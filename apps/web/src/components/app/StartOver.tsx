/** "Make new meals" / "Make new workouts" for this week, with a confirm step because changes are lost. */
import { useState } from 'react'
import { ApiError } from '../../lib/auth'
import { toast } from '../../lib/toast'
import { rebuildWeek, type Weekly } from '../../lib/week'
import { Icon } from './Icon'

export function StartOver<T>({ weekStart, part, onPlan }: { weekStart: string; part: 'meals' | 'workouts'; onPlan: (data: Weekly<T>) => void }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      onPlan(await rebuildWeek<T>(weekStart, part))
      setAsking(false)
      toast(`Here are new ${part} for this week.`)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : `Could not make new ${part}.`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-3 text-violet"><Icon name="refresh" /></span>
          <div>
            <p className="font-bold text-heading">Want something different?</p>
            <p className="text-sm text-muted">Get a fresh set of {part} for this week. Your targets and safety rules stay the same.</p>
          </div>
        </div>
        {!asking && (
          <button type="button" onClick={() => setAsking(true)} className="inline-flex items-center gap-2 rounded-xl border-2 border-violet/30 bg-white px-4 py-2.5 text-sm font-semibold text-violet transition hover:border-violet hover:bg-ink-3">
            <Icon name="refresh" className="h-4 w-4" /> Make new {part}
          </button>
        )}
      </div>
      {asking && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <p className="flex items-start gap-2"><Icon name="info" className="mt-0.5 h-4 w-4 shrink-0" />This replaces all of this week's {part}, including any you changed.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={go} disabled={busy} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Planning…' : `Yes, make new ${part}`}
            </button>
            <button type="button" onClick={() => setAsking(false)} disabled={busy} className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-heading hover:bg-ink-2">Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
