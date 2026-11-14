/**
 * Tiny persistent store (no extra library) for the pages that still use demo data:
 * users, AI settings and feature flags. Saves to localStorage so changes survive a reload.
 * Foods, exercises, safety rules and the audit log are real and live in ./content.
 * Sign-in is real and lives in ./auth.
 */
import { useSyncExternalStore } from 'react'
import type { AiSettings, FeatureFlags, User } from './types'
import { seedAiSettings, seedFlags, seedUsers } from './seed'

type State = {
  users: User[]
  ai: AiSettings
  flags: FeatureFlags
}

// v2: foods, exercises, rules and audit moved to the API, so older saved copies are ignored.
const KEY = 'wellpath-admin-v2'

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as State
  } catch { /* storage blocked: fall back to seed */ }
  return { users: seedUsers(), ai: seedAiSettings, flags: seedFlags }
}

let state: State = load()
const listeners = new Set<() => void>()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    localStorage.removeItem('wellpath-admin-v1')
  } catch { /* ignore */ }
}

export function setState(update: (s: State) => Partial<State>) {
  state = { ...state, ...update(state) }
  save()
  listeners.forEach((l) => l())
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb) },
    () => selector(state),
  )
}

export function resetDemoData() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  state = load()
  save()
  listeners.forEach((l) => l())
}
