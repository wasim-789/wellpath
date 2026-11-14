/**
 * Deterministic demo data so the panel looks real before the API exists.
 * A seeded random generator means everyone sees the same data on every reload.
 */
import type { AiSettings, Condition, FeatureFlags, User } from './types'
import { ACTIVITY_LEVELS, GOALS } from '@wellpath/shared'

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}
const rand = rng(42)
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]
const int = (min: number, max: number) => Math.floor(min + rand() * (max - min + 1))
const DAY = 86_400_000
const now = Date.now()

const first = ['Ayesha', 'Omar', 'Sara', 'Ali', 'Fatima', 'Hassan', 'Zara', 'Bilal', 'Hina', 'Usman', 'Maria', 'John', 'Emma', 'Liam', 'Noah', 'Aisha', 'Daniel', 'Sofia', 'Ahmed', 'Mehak', 'Ibrahim', 'Laila', 'Ryan', 'Nadia', 'Kamran', 'Olivia', 'Yusuf', 'Hamza', 'Iqra', 'Lucas']
const last = ['Khan', 'Ahmed', 'Raza', 'Malik', 'Sheikh', 'Iqbal', 'Hussain', 'Butt', 'Chaudhry', 'Garcia', 'Miller', 'Wilson', 'Chen', 'Smith', 'Rahman', 'Siddiqui', 'Qureshi', 'Brown', 'Patel', 'Ali']
const countries = ['Pakistan', 'Pakistan', 'Pakistan', 'United Arab Emirates', 'United Kingdom', 'United States', 'Saudi Arabia', 'Canada']
const conds: Condition[] = ['knee_pain', 'lower_back_pain', 'high_blood_pressure', 'shoulder_injury']

export function seedUsers(n = 140): User[] {
  return Array.from({ length: n }, (_, i) => {
    const f = pick(first), l = pick(last)
    const sex = rand() > 0.5 ? 'female' as const : 'male' as const
    const joined = now - Math.pow(rand(), 0.7) * 60 * DAY
    const conditions = conds.filter(() => rand() < 0.05)
    return {
      id: `usr_${(1000 + i).toString(36)}${int(100, 999)}`,
      name: `${f} ${l}`,
      email: `${f}.${l}${int(1, 99)}@example.com`.toLowerCase(),
      country: pick(countries),
      sex,
      age: int(18, 58),
      heightCm: sex === 'male' ? int(162, 190) : int(150, 175),
      weightKg: sex === 'male' ? int(60, 112) : int(48, 95),
      activityLevel: pick(ACTIVITY_LEVELS),
      goal: pick(GOALS),
      conditions,
      status: (rand() < 0.04 ? 'suspended' : 'active') as User['status'],
      joinedAt: new Date(joined).toISOString(),
      lastActiveAt: new Date(Math.min(now, joined + rand() * (now - joined))).toISOString(),
      aiQuestionsToday: int(0, 20),
      streakDays: int(0, 45),
      weightChangeKg: Math.round((rand() * 5 - 3.2) * 10) / 10,
    }
  }).sort((a, b) => b.joinedAt.localeCompare(a.joinedAt))
}

export const seedAiSettings: AiSettings = {
  enabled: true,
  fallbackOrder: ['gemini', 'groq', 'openai'],
  dailyLimitPerUser: 20,
  temperature: 0.3,
  cacheEnabled: true,
  promptVersion: 'coach-v1.3',
}

export const seedFlags: FeatureFlags = { maintenanceMode: false, ramadanMode: false, photoLogging: false, weeklyReports: true, signupsOpen: true }

/** Seven days of AI usage by provider, for the dashboard and AI pages. */
export const aiUsage = Array.from({ length: 7 }, (_, i) => {
  const d = new Date(now - (6 - i) * DAY)
  const gemini = int(380, 620)
  const groq = int(40, 120)
  const cached = int(150, 260)
  return { day: d.toLocaleDateString('en-GB', { weekday: 'short' }), gemini, groq, openai: 0, cached, errors: int(2, 14), p50ms: int(900, 1500) }
})
