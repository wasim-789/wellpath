/** Loading a weekly plan (meals or workouts) for the user's own week, and week date helpers. */
import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './auth'

export type Weekly<T> = { weekStart: string; plan: T }

type LoadState<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: Weekly<T> }

/** Loads `path` for this week. replace() shows a plan the server sent back (after a swap) without loading again. */
export function useWeekly<T>(path: string, failure: string) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    // Ask for the user's own (local) week, so Monday morning in Pakistan is not still last week in UTC.
    api<Weekly<T>>(`${path}?week=${localWeekStart()}`)
      .then((data) => { if (live) setState({ status: 'ready', data }) })
      .catch((err: unknown) => {
        if (live) setState({ status: 'error', message: err instanceof ApiError ? err.message : failure })
      })
    return () => { live = false }
  }, [path, failure, attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])
  const replace = useCallback((data: Weekly<T>) => setState({ status: 'ready', data }), [])

  return { state, retry, replace }
}

const indexOf = (d: Date) => (d.getDay() + 6) % 7

/** Monday is 0, matching the plan's day numbers. */
export const todayIndex = () => indexOf(new Date())

/** This week's Monday in the user's time zone, as YYYY-MM-DD. */
export function localWeekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - indexOf(now))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The date of a plan day, for labels like "Mon 16 Nov". */
export function dayDate(weekStart: string, day: number) {
  const d = new Date(`${weekStart}T00:00:00`)
  d.setDate(d.getDate() + day)
  return d
}

/** Start this week's meals or workouts over. Returns that part of the new plan. */
export const rebuildWeek = <T>(week: string, part: 'meals' | 'workouts') =>
  api<Weekly<T>>('/api/v1/plan/rebuild', { method: 'POST', body: JSON.stringify({ week, part }) })

/** The day to show first: ?day=0-6 from a link, or today. */
export function dayFromQuery(value: string | null) {
  const n = Number(value)
  return value !== null && Number.isInteger(n) && n >= 0 && n <= 6 ? n : todayIndex()
}
