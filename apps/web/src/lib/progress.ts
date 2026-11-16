/**
 * Daily progress, saved to the account: sets ticked off and meals eaten, with the week summary and streak.
 *
 * One shared store for the whole app, so ticking something on one page updates every other page.
 * Changes show at once and are put back if the server refuses them.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { FoodTextResult, LogFood } from '@wellpath/engine'
import type { MealSlot, Nutrients } from '@wellpath/shared'
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
  foods: FoodEntry[]
  intake: { kcal: number; proteinG: number }
  water: number
  weightKg: number | null
  active: boolean
}

export type FoodEntry = { id: string; slot: MealSlot; slug: string; name: string; quantity: number; portionIndex: number; amount: string; grams: number; nutrients: Nutrients }

export type WaterTarget = { glasses: number; ml: number; reason: string }

export type WeekProgress = {
  weekStart: string
  today: string
  days: DayProgress[]
  week: { workoutsDone: number; workoutsPlanned: number; mealsEaten: number; mealsPlanned: number; activeDays: number }
  streak: { current: number; best: number }
  water: WaterTarget
  targets: { calories: number; proteinG: number }
  lastWeight: { date: string; weightKg: number } | null
}

export type History = {
  from: string
  to: string
  days: { date: string; weightKg: number | null; water: number; meals: number; kcal: number; workout: { done: number; total: number } | null }[]
  trend: { date: string; trendKg: number }[]
  water: WaterTarget
  targetKcal: number | null
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
      // Taps still being saved are newer than this answer: keep them on screen, their save will bring the update.
      if (busy()) return
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

const put = (path: string, body: object) =>
  api<WeekProgress>(path, { method: 'PUT', body: JSON.stringify({ week: localWeekStart(), today: localToday(), ...body }) })

async function save(path: string, body: object) {
  set({ status: 'ready', data: await put(path, body) })
}

/*
 * Saving taps. Changes show at once; the save is sent once the person pauses (SAVE_DELAY_MS), and quick
 * repeated taps on the same thing (one exercise, one meal, one day's water) send only the last value.
 * That keeps the request count low (the API allows about 100 a minute) and stops replies arriving out of
 * order from showing older values: a reply is shown only once nothing newer is waiting.
 */
const SAVE_DELAY_MS = 350
const queued = new Map<string, { path: string; body: object; timer: ReturnType<typeof setTimeout> }>()
let inFlight = 0
let latest: WeekProgress | null = null
let failure: string | null = null

const busy = () => inFlight > 0 || queued.size > 0

async function flush(key: string) {
  const job = queued.get(key)
  if (!job) return
  queued.delete(key)
  inFlight++
  try {
    latest = await put(job.path, job.body)
  } catch (err) {
    failure ??= err instanceof ApiError ? err.message : 'Could not save that. Check your connection and try again.'
  } finally {
    inFlight--
  }
  if (busy()) return
  if (failure) {
    toast(failure, 'error')
    failure = null
    latest = null
    void load() // show what was really saved
  } else if (latest) {
    set({ status: 'ready', data: latest })
    latest = null
  }
}

function change(day: number, key: string, edit: (d: DayProgress) => DayProgress, path: string, body: object) {
  if (state.status === 'ready') {
    const days = state.data.days.map((d) => (d.day === day ? edit(d) : d))
    set({ status: 'ready', data: { ...state.data, days } })
  }
  const id = `${key}|${day}`
  const waiting = queued.get(id)
  if (waiting) clearTimeout(waiting.timer)
  queued.set(id, { path, body: { day, ...body }, timer: setTimeout(() => void flush(id), SAVE_DELAY_MS) })
}

export const setSets = (day: number, slug: string, sets: number) =>
  change(day, `sets:${slug}`, (d) => ({ ...d, sets: { ...d.sets, [slug]: sets } }), '/api/v1/progress/sets', { slug, sets })

export const setMealEaten = (day: number, slot: MealSlot, eaten: boolean) =>
  change(day, `meal:${slot}`, (d) => ({ ...d, meals: eaten ? [...d.meals.filter((m) => m !== slot), slot] : d.meals.filter((m) => m !== slot) }), '/api/v1/progress/meals', { slot, eaten })

/** Adds (or with a negative number, removes) glasses of water, counting from what is on screen now, so fast taps all count. */
export function addWater(day: number, delta: number) {
  if (state.status !== 'ready') return
  const glasses = Math.min(30, Math.max(0, state.data.days[day]!.water + delta))
  change(day, 'water', (d) => ({ ...d, water: glasses }), '/api/v1/progress/water', { glasses })
}

/** Saves a weigh-in (today unless a date is given), then reloads the week so the water goal follows the new weight. */
export async function saveWeight(weightKg: number, date?: string) {
  await api<void>('/api/v1/progress/weight', { method: 'PUT', body: JSON.stringify({ today: localToday(), date, weightKg }) })
  await load()
}

export async function removeWeight(date: string) {
  await api<void>('/api/v1/progress/weight?today=' + localToday() + '&date=' + date, { method: 'DELETE' })
  await load()
}

/* ---------- typed-in food ---------- */

/** The food library for the picker, loaded once per visit. */
let library: Promise<LogFood[]> | null = null
export function foodLibrary(): Promise<LogFood[]> {
  library ??= api<{ foods: LogFood[] }>('/api/v1/progress/foods').then((r) => r.foods, (err: unknown) => { library = null; throw err })
  return library
}

/** What a piece of text says was eaten. Saves nothing. */
export const readFood = (text: string) => api<FoodTextResult>('/api/v1/progress/food/read', { method: 'POST', body: JSON.stringify({ text }) })

/** Adds foods to one meal of one day. The server works out the nutrients from the library. */
export async function logFoods(day: number, slot: MealSlot, items: { slug: string; portionIndex: number; quantity: number }[]) {
  const data = await api<WeekProgress>('/api/v1/progress/food', { method: 'POST', body: JSON.stringify({ week: localWeekStart(), today: localToday(), day, slot, items }) })
  set({ status: 'ready', data })
}

export async function removeFood(day: number, id: string) {
  const data = await api<WeekProgress>('/api/v1/progress/food?week=' + localWeekStart() + '&today=' + localToday() + '&day=' + day + '&id=' + id, { method: 'DELETE' })
  set({ status: 'ready', data })
}

/** Day-by-day numbers for the charts. */
export const fetchHistory = (days: 7 | 30 | 90) => api<History>('/api/v1/progress/history?today=' + localToday() + '&days=' + days)

/** Loads progress when a page opens (and again when the plan changes), and re-renders on every change. */
export function useProgress(reloadKey?: unknown) {
  const current = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => state)
  useEffect(() => { void load() }, [reloadKey])
  return current
}

/** True when a plan day is still to come, so it cannot be ticked off yet. */
export const isFuture = (p: WeekProgress, day: number) => p.days[day]!.date > p.today
