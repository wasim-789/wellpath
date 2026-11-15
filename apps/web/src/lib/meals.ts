/** Loading this week's meal plan. */
import { useCallback, useEffect, useState } from 'react'
import type { MealChoice, MealPlan, PlannedMeal } from '@wellpath/engine'
import type { MealSlot } from '@wellpath/shared'
import { ApiError, api } from './auth'

export type MealsResponse = { weekStart: string; plan: MealPlan }

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: MealsResponse }

export function useMealPlan() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    // Ask for the user's own (local) week, so Monday morning in Pakistan is not still last week in UTC.
    api<MealsResponse>(`/api/v1/plan/meals?week=${localWeekStart()}`)
      .then((data) => { if (live) setState({ status: 'ready', data }) })
      .catch((err: unknown) => {
        if (live) setState({ status: 'error', message: err instanceof ApiError ? err.message : 'Could not load your meal plan.' })
      })
    return () => { live = false }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }, [])

  /** Show a plan the server sent back after a swap, without loading again. */
  const replace = useCallback((data: MealsResponse) => setState({ status: 'ready', data }), [])

  return { state, retry, replace }
}

const mealQuery = (week: string, day: number, slot: MealSlot) => `week=${week}&day=${day}&slot=${slot}`

/** Up to three other plates for one meal, chosen by the planner with the same rules. */
export const fetchAlternatives = (week: string, day: number, slot: MealSlot) =>
  api<{ options: PlannedMeal[] }>(`/api/v1/plan/meals/alternatives?${mealQuery(week, day, slot)}`).then((r) => r.options)

/** Swap one meal for an alternative. Returns the updated week. */
export const swapMeal = (week: string, day: number, slot: MealSlot, items: MealChoice) =>
  api<MealsResponse>('/api/v1/plan/meals/swap', { method: 'PUT', body: JSON.stringify({ week, day, slot, items }) })

/** Put one meal back to the original plan. Returns the updated week. */
export const undoSwap = (week: string, day: number, slot: MealSlot) =>
  api<MealsResponse>(`/api/v1/plan/meals/swap?${mealQuery(week, day, slot)}`, { method: 'DELETE' })

/** Monday is 0, matching the plan's day numbers. */
export const todayIndex = () => (new Date().getDay() + 6) % 7

/** This week's Monday in the user's time zone, as YYYY-MM-DD. */
export function localWeekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIndexOf(now))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayIndexOf = (d: Date) => (d.getDay() + 6) % 7

/** The date of a plan day, for labels like "Mon 16 Nov". */
export function dayDate(weekStart: string, day: number) {
  const d = new Date(`${weekStart}T00:00:00`)
  d.setDate(d.getDate() + day)
  return d
}

export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Evening snack', dinner: 'Dinner' } as const
