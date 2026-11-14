/**
 * Real admin data from the API: foods, exercises, safety rules and the audit log.
 * Every call goes through the signed-in admin session (see ./auth).
 */
import { useCallback, useEffect, useState } from 'react'
import type { Condition, Exercise, ExerciseLoad, ExerciseType, Food } from '@wellpath/shared'
import { api } from './auth'

export type Stored<T> = T & { updatedAt: string }

export type SafetyRule = {
  condition: Condition
  blockedLoads: ExerciseLoad[]
  notice: string
  blockedExercises: { slug: string; name: string }[]
  /** Safe beginner exercises left for someone with only this condition. */
  beginnerLeft: Record<ExerciseType, number>
  usersAffected: number
}

export type AuditEntry = { id: string; at: string; actor: string; action: string; target: string; detail: string | null }

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) })
const enc = encodeURIComponent

export const foodsApi = {
  list: () => api<{ items: Stored<Food>[] }>('/api/v1/admin/foods').then((r) => r.items),
  create: (f: Food) => api<{ item: Stored<Food> }>('/api/v1/admin/foods', json('POST', f)).then((r) => r.item),
  update: (f: Food) => api<{ item: Stored<Food> }>(`/api/v1/admin/foods/${enc(f.slug)}`, json('PUT', f)).then((r) => r.item),
  verify: (slug: string) => api<{ item: Stored<Food> }>(`/api/v1/admin/foods/${enc(slug)}/verify`, json('POST')).then((r) => r.item),
  remove: (slug: string) => api<void>(`/api/v1/admin/foods/${enc(slug)}`, json('DELETE')),
}

export const exercisesApi = {
  list: () => api<{ items: Stored<Exercise>[] }>('/api/v1/admin/exercises').then((r) => r.items),
  create: (e: Exercise) => api<{ item: Stored<Exercise> }>('/api/v1/admin/exercises', json('POST', e)).then((r) => r.item),
  update: (e: Exercise) => api<{ item: Stored<Exercise> }>(`/api/v1/admin/exercises/${enc(e.slug)}`, json('PUT', e)).then((r) => r.item),
  remove: (slug: string) => api<void>(`/api/v1/admin/exercises/${enc(slug)}`, json('DELETE')),
}

export const safetyApi = {
  list: () => api<{ rules: SafetyRule[]; exerciseCount: number }>('/api/v1/admin/safety-rules'),
}

export const auditApi = {
  page: (before?: string) => api<{ entries: AuditEntry[]; next: string | null }>(`/api/v1/admin/audit${before ? `?before=${enc(before)}` : ''}`),
}

/** Loads data once on mount. reload() fetches again; set() updates the copy in place after a save. */
export function useLoad<T>(load: () => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true })

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }))
    load().then(
      (data) => setState({ data, error: null, loading: false }),
      (err: unknown) => setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Could not load data.' })),
    )
    // load is a stable module-level function in every caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(reload, [reload])

  const set = useCallback((update: (data: T) => T) => setState((s) => (s.data === null ? s : { ...s, data: update(s.data) })), [])
  return { ...state, reload, set }
}

/** Turns "full_body" into "Full body". */
export const humanize = (s: string) => (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, ' ')

/** "Chicken Karahi!" -> "chicken-karahi", matching the API's slug rule. */
export const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** Turns a list of validation issues into { "per100g.kcal": "message" }, first message per path. */
export function issueMap(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of issues) out[i.path.map(String).join('.')] ??= i.message
  return out
}
