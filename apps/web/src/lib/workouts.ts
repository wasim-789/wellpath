/** This week's home workouts, and swapping one exercise. */
import type { PlannedExercise, WorkoutPlan } from '@wellpath/engine'
import { api } from './auth'
import { useWeekly, type Weekly } from './week'

export type WorkoutsResponse = Weekly<WorkoutPlan>

export const useWorkoutPlan = () => useWeekly<WorkoutPlan>('/api/v1/plan/workouts', 'Could not load your workouts.')

const enc = encodeURIComponent

/** Up to three safe exercises that could take this one's place. */
export const fetchExerciseAlternatives = (week: string, day: number, slug: string) =>
  api<{ options: PlannedExercise[] }>(`/api/v1/plan/workouts/alternatives?week=${week}&day=${day}&slug=${enc(slug)}`).then((r) => r.options)

/** Swap one exercise for an alternative. Returns the updated week. */
export const swapExercise = (week: string, day: number, slug: string, replacement: string) =>
  api<WorkoutsResponse>('/api/v1/plan/workouts/swap', { method: 'PUT', body: JSON.stringify({ week, day, slug, replacement }) })

/** Put a swapped exercise back. `slug` is the exercise shown now. */
export const undoExerciseSwap = (week: string, day: number, slug: string) =>
  api<WorkoutsResponse>(`/api/v1/plan/workouts/swap?week=${week}&day=${day}&slug=${enc(slug)}`, { method: 'DELETE' })

export const FOCUS_LABEL = { strength: 'Strength', cardio: 'Cardio and core' } as const
export const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const
