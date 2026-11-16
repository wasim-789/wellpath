/**
 * Daily progress, saved to the account: sets ticked off and meals eaten, with the week summary and streak.
 *
 * One shared store for the whole app, so ticking something on one page updates every other page.
 * Changes show at once and are put back if the server refuses them.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { MealSlot } from '@wellpath/shared'
import { ApiError, api, isSignedIn, onAuthChange } from './auth'
import { toast } from './toast'
import { localWeekStart } from './week'

export type DayProgress = {
  day: number
  date: string
  sets: Record<string, number>
  meals: MealSlot[]
  workout: { done: number; total: number; complete: boolean } | null
  eaten: { done: number; total: number }
  active: boolean
}

export type WeekProgress = {
  weekStart: string
  today: string
  days: DayProgress[]
  week: { workoutsDone: number; workoutsPlanned: number; mealsEaten: number; mealsPlanned: number; activeDays: number }
  streak: { current: number; best: number }
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: WeekProgress }

/** The user's own date, YYYY-MM-DD. */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

let state: State = { status: 'loading' }
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function set(next: State) {
  state = next
  listeners.forEach((l) => l())
}

// Someone signed out: forget their progress, so the next person never sees it.
onAuthChange(() => { if (!isSignedIn() && state.status !== 'loading') set({ status: 'loading' }) })

const query = () => `week=${localWeekStart()}&today=${localToday()}`

function load(): Promise<void> {
  loading ??= api<WeekProgress>(`/api/v1/progress?${query()}`)
    .then(async (data) => {
      set({ status: 'ready', data })
      await moveOldTicks(data)
    })
    .catch((err: unknown) => {
      if (state.status !== 'ready') set({ status: 'error', message: err instanceof ApiError ? err.message : 'Could not load your progress.' })
    })
    .finally(() => { loading = null })
  return loading
}

/**
 * Earlier versions kept set ticks in this browser only. Move this week's to the account once, then forget them.
 */
async function moveOldTicks(data: WeekProgress) {
  for (const d of data.days) {
    const key = `wellpath:done:${data.weekStart}:${d.day}`
    let old: Record<string, number> = {}
    try { old = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number> } catch { continue }
    const entries = Object.entries(old).filter(([slug, n]) => n > 0 && !d.sets[slug])
    try { localStorage.removeItem(key) } catch { /* storage blocked */ }
    for (const [slug, n] of entries) {
      try { await save('/api/v1/progress/sets', { day: d.day, slug, sets: n }) } catch { /* not in the plan any more: drop it */ }
    }
  }
}

async function save(path: string, body: object) {
  const data = await api<WeekProgress>(path, { method: 'PUT', body: JSON.stringify({ week: localWeekStart(), today: localToday(), ...body }) })
  set({ status: 'ready', data })
}

/** Applies a change on screen at once, saves it, and puts it back if saving fails. */
async function change(day: number, edit: (d: DayProgress) => DayProgress, path: string, body: object) {
  const before = state
  if (state.status === 'ready') {
    const days = state.data.days.map((d) => (d.day === day ? edit(d) : d))
    set({ status: 'ready', data: { ...state.data, days } })
  }
  try {
    await save(path, { day, ...body })
  } catch (err) {
    set(before)
    toast(err instanceof ApiError ? err.message : 'Could not save that. Check your connection and try again.', 'error')
  }
}

export const setSets = (day: number, slug: string, sets: number) =>
  change(day, (d) => ({ ...d, sets: { ...d.sets, [slug]: sets } }), '/api/v1/progress/sets', { slug, sets })

export const setMealEaten = (day: number, slot: MealSlot, eaten: boolean) =>
  change(day, (d) => ({ ...d, meals: eaten ? [...d.meals, slot] : d.meals.filter((m) => m !== slot) }), '/api/v1/progress/meals', { slot, eaten })

/** Loads progress when a page opens (and again when the plan changes), and re-renders on every change. */
export function useProgress(reloadKey?: unknown) {
  const current = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => state)
  useEffect(() => { void load() }, [reloadKey])
  return current
}

/** True when a plan day is still to come, so it cannot be ticked off yet. */
export const isFuture = (p: WeekProgress, day: number) => p.days[day]!.date > p.today
