/** This week's home workouts. */
import type { WorkoutPlan } from '@wellpath/engine'
import { useWeekly } from './week'

export const useWorkoutPlan = () => useWeekly<WorkoutPlan>('/api/v1/plan/workouts', 'Could not load your workouts.')

export const FOCUS_LABEL = { strength: 'Strength', cardio: 'Cardio and core' } as const
export const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const
