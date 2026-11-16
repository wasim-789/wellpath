/** This week's meal plan, and swapping one meal. */
import type { MealChoice, MealPlan, PlannedMeal } from '@wellpath/engine'
import type { MealSlot } from '@wellpath/shared'
import { api } from './auth'
import { useWeekly, type Weekly } from './week'
import type { IconName } from '../components/app/Icon'

export type MealsResponse = Weekly<MealPlan>

export const useMealPlan = () => useWeekly<MealPlan>('/api/v1/plan/meals', 'Could not load your meal plan.')

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

export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', snack: 'Evening snack', dinner: 'Dinner' } as const

/** Icon, colours and time of day for each meal, shared with the dashboard. */
export const SLOT_STYLE: Record<MealSlot, { icon: IconName; tint: string; band: string; when: string }> = {
  breakfast: { icon: 'sunrise', tint: 'bg-amber-100 text-amber-600', band: 'from-amber-50', when: 'Morning' },
  lunch: { icon: 'bowl', tint: 'bg-emerald-100 text-emerald-600', band: 'from-emerald-50', when: 'Midday' },
  snack: { icon: 'cup', tint: 'bg-rose-100 text-rose-500', band: 'from-rose-50', when: 'Evening' },
  dinner: { icon: 'moon', tint: 'bg-indigo-100 text-violet', band: 'from-indigo-50', when: 'Night' },
}
