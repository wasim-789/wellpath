/** Data shapes for the demo-data pages, plus labels. Real content types come from @wellpath/shared (see ./content). */
import type { ActivityLevel, Condition, Goal, Sex } from '@wellpath/shared'

export type { Condition }

export type UserStatus = 'active' | 'suspended'

export type User = {
  id: string
  name: string
  email: string
  country: string
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goal: Goal
  conditions: Condition[]
  status: UserStatus
  joinedAt: string
  lastActiveAt: string
  aiQuestionsToday: number
  streakDays: number
  weightChangeKg: number
}

export type Provider = 'gemini' | 'groq' | 'openai'
export type AiSettings = {
  enabled: boolean
  fallbackOrder: Provider[]
  dailyLimitPerUser: number
  temperature: number
  cacheEnabled: boolean
  promptVersion: string
}

export type FeatureFlags = {
  maintenanceMode: boolean
  ramadanMode: boolean
  photoLogging: boolean
  weeklyReports: boolean
  signupsOpen: boolean
}

export const CONDITION_LABEL: Record<Condition, string> = {
  knee_pain: 'Knee pain',
  lower_back_pain: 'Lower back pain',
  high_blood_pressure: 'High blood pressure',
  shoulder_injury: 'Shoulder injury',
  diabetes: 'Diabetes',
}
export const GOAL_LABEL: Record<Goal, string> = {
  lose_weight: 'Lose weight',
  gain_weight: 'Gain weight',
  maintain: 'Maintain',
  general_fitness: 'General fitness',
}
export const PROVIDER_LABEL: Record<Provider, string> = { gemini: 'Google Gemini', groq: 'Groq', openai: 'OpenAI' }
