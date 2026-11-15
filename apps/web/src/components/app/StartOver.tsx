/** "Make new meals" / "Make new workouts" for this week, with a confirm step because changes are lost. */
import { useState } from 'react'
import { ApiError } from '../../lib/auth'
import { toast } from '../../lib/toast'
import { rebuildWeek, type Weekly } from '../../lib/week'

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

  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-heading hover:bg-ink-2">
        Make new {part} for this week
      </button>
    )
  }
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
      <p>This replaces all of this week's {part}, including any you changed. Your targets and safety rules stay the same.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={go} disabled={busy} className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? 'Planning…' : `Yes, make new ${part}`}
        </button>
        <button type="button" onClick={() => setAsking(false)} disabled={busy} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-heading">Cancel</button>
      </div>
    </div>
  )
}
