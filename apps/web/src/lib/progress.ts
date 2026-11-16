/**
 * Which sets the person has ticked off today, kept in this browser only (a convenience, not a record):
 * it resets for a new week, and simply starts empty if storage is blocked.
 */
import { useCallback, useState } from 'react'

type Done = Record<string, number>

const keyFor = (weekStart: string, day: number) => `wellpath:done:${weekStart}:${day}`

function read(key: string): Done {
  try {
    const raw = localStorage.getItem(key)
    const value: unknown = raw ? JSON.parse(raw) : {}
    return value && typeof value === 'object' ? (value as Done) : {}
  } catch {
    return {}
  }
}

export function useDayProgress(weekStart: string, day: number) {
  const key = keyFor(weekStart, day)
  const [state, setState] = useState<{ key: string; done: Done }>(() => ({ key, done: read(key) }))
  // A different day was picked: load that day's ticks.
  const done = state.key === key ? state.done : read(key)
  if (state.key !== key) setState({ key, done })

  const setSets = useCallback((slug: string, sets: number) => {
    setState((s) => {
      const next = { ...s.done, [slug]: sets }
      try { localStorage.setItem(s.key, JSON.stringify(next)) } catch { /* storage blocked: keep it for this visit only */ }
      return { key: s.key, done: next }
    })
  }, [])

  return { done, setSets }
}

/** How many of these exercises are fully ticked off for one day, without subscribing to changes. */
export function finishedCount(weekStart: string, day: number, exercises: readonly { slug: string; sets: number }[]): number {
  const done = read(keyFor(weekStart, day))
  return exercises.filter((e) => (done[e.slug] ?? 0) >= e.sets).length
}
