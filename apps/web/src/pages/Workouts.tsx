/** This week's home workouts, one day at a time, with how to do each exercise and a way to swap one. */
import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { workoutReasonText, type PlannedExercise, type WorkoutSession } from '@wellpath/engine'
import { AppShell, Notice } from '../components/app/AppShell'
import { DayTabs } from '../components/app/DayTabs'
import { StartOver } from '../components/app/StartOver'
import { ApiError } from '../lib/auth'
import { toast } from '../lib/toast'
import { dayDate, dayFromQuery } from '../lib/week'
import { FOCUS_LABEL, LEVEL_LABEL, fetchExerciseAlternatives, swapExercise, undoExerciseSwap, useWorkoutPlan, type WorkoutsResponse } from '../lib/workouts'

type Swap = { weekStart: string; day: number; onPlan: (data: WorkoutsResponse) => void }

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

function Steps({ e }: { e: PlannedExercise }) {
  return (
    <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-text">
      {e.steps.map((s) => <li key={s}>{s}</li>)}
    </ol>
  )
}

function ExerciseRow({ e, swap }: { e: PlannedExercise; swap: Swap }) {
  const [options, setOptions] = useState<PlannedExercise[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function openChoices() {
    setBusy(true)
    try {
      const found = await fetchExerciseAlternatives(swap.weekStart, swap.day, e.slug)
      if (found.length) setOptions(found)
      else toast(`No other safe exercise can take the place of ${e.name.toLowerCase()} right now.`, 'error')
    } catch (err) {
      toast(errorText(err, 'Could not load other exercises.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<WorkoutsResponse>, done: string) {
    setBusy(true)
    try {
      swap.onPlan(await action())
      setOptions(null)
      toast(done)
    } catch (err) {
      toast(errorText(err, 'Could not change this exercise.'), 'error')
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) setOptions(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="py-3">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 text-sm">
          <span className="text-heading">
            <span className="font-medium">{e.name}</span>
            {e.swapped && <span className="ml-1.5 rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-semibold text-mint">Your pick</span>}
            <span className="text-muted"> · {e.amount}</span>
            {e.sets > 1 && <span className="text-muted">, rest {e.restSeconds} s</span>}
          </span>
          <span className="shrink-0 text-xs font-semibold text-violet group-open:hidden">How to</span>
          <span className="hidden shrink-0 text-xs font-semibold text-muted group-open:inline">Hide</span>
        </summary>
        <Steps e={e} />
      </details>

      {!options && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" onClick={openChoices} disabled={busy} className="text-xs font-semibold text-violet hover:underline disabled:opacity-50">
            {busy ? 'Finding others…' : 'Change this exercise'}
          </button>
          {e.swapped && (
            <button type="button" disabled={busy} onClick={() => run(() => undoExerciseSwap(swap.weekStart, swap.day, e.slug), `${e.original?.name ?? 'The planned exercise'} is back.`)} className="text-xs font-semibold text-muted hover:underline disabled:opacity-50">
              Back to {e.original?.name ?? 'the original'}
            </button>
          )}
        </div>
      )}

      {options && (
        <div className="mt-2 rounded-xl border border-line p-3">
          <p className="text-xs text-muted">Each one is safe for you, works similar muscles and takes about the same time.</p>
          <ul className="mt-2 divide-y divide-line">
            {options.map((o) => (
              <li key={o.slug} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-heading"><span className="font-medium">{o.name}</span><span className="text-muted"> · {o.amount}</span></span>
                <button
                  type="button" disabled={busy}
                  onClick={() => run(() => swapExercise(swap.weekStart, swap.day, e.slug, o.slug), `${e.name} changed to ${o.name.toLowerCase()}.`)}
                  className="btn-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >Choose</button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setOptions(null)} disabled={busy} className="mt-1 text-xs font-semibold text-muted hover:underline">Keep {e.name.toLowerCase()}</button>
        </div>
      )}
    </li>
  )
}

function Block({ title, sub, items, swap }: { title: string; sub: string; items: PlannedExercise[]; swap: Swap }) {
  if (!items.length) return null
  const minutes = Math.round(items.reduce((t, e) => t + e.durationSeconds, 0) / 60)
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-heading">{title}</h3>
        <p className="text-sm tabular-nums text-muted">about {Math.max(1, minutes)} min</p>
      </div>
      <p className="text-xs text-muted">{sub}</p>
      <ul className="mt-1 divide-y divide-line">{items.map((e) => <ExerciseRow key={`${swap.day}-${e.slug}`} e={e} swap={swap} />)}</ul>
    </section>
  )
}

function Session({ session, swap }: { session: WorkoutSession; swap: Swap }) {
  return (
    <>
      <div className="mt-3 space-y-1">
        {session.reasons.map((r) => <p key={r.code} className="text-sm text-muted">{workoutReasonText(r)}</p>)}
      </div>
      <div className="mt-4 space-y-4">
        <Block title="Warm-up" sub="Easy moves to get your body ready." items={session.warmup} swap={swap} />
        <Block title="Workout" sub="Go at a steady pace. Breathe out as you push or lift." items={session.main} swap={swap} />
        <Block title="Cool-down" sub="Hold each stretch gently. It should never hurt." items={session.cooldown} swap={swap} />
      </div>
    </>
  )
}

export function Workouts() {
  const { state, retry, replace } = useWorkoutPlan()
  const [params] = useSearchParams()
  const [picked, setPicked] = useState<number | null>(null)
  const day = picked ?? dayFromQuery(params.get('day'))

  if (state.status === 'error' && /onboarding/i.test(state.message)) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      <Link to="/week" className="text-sm font-semibold text-violet hover:underline">← Your week</Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-heading">Your workouts this week</h1>

      {state.status === 'loading' && <p className="mt-8 text-sm text-muted" role="status">Planning your workouts…</p>}

      {state.status === 'error' && (
        <div className="card mt-8 p-6" role="alert">
          <p className="text-sm text-heading">{state.message}</p>
          <button type="button" onClick={retry} className="btn-primary mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      )}

      {state.status === 'ready' && (() => {
        const { plan, weekStart } = state.data
        const current = plan.days[day]
        const s = current.session
        return (
          <>
            <p className="mt-2 text-muted">
              <span className="font-semibold text-heading">{plan.daysPerWeek} workouts</span> of about{' '}
              <span className="font-semibold text-heading">{plan.minutesPerSession} minutes</span> at home, {LEVEL_LABEL[plan.level].toLowerCase()} level.
            </p>

            <div className="mt-6">
              <DayTabs weekStart={weekStart} value={day} onChange={setPicked} note={(d) => (plan.days[d].session ? undefined : 'Rest')} />
            </div>

            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-heading">
                {dayDate(weekStart, day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                <span className="text-muted"> · {s ? FOCUS_LABEL[s.focus] : 'Rest day'}</span>
              </h2>
              {s && <p className="text-sm text-muted"><span className="font-semibold tabular-nums text-heading">{s.minutes} min</span> · about {s.kcal} kcal</p>}
            </div>

            {s ? <Session session={s} swap={{ weekStart, day, onPlan: replace }} /> : (
              <div className="card mt-4 p-5">
                {current.reasons.map((r) => <p key={r.code} className="text-sm text-heading">{workoutReasonText(r)}</p>)}
              </div>
            )}

            <div className="mt-8 space-y-4">
              <Notice tone="amber" title="Stay safe" items={['Stop if you feel chest pain, dizziness, or sharp or growing pain, and see a doctor if it does not settle quickly.']} />
              <Notice tone="blue" title="How this plan was made" items={plan.reasons.map(workoutReasonText)} />
              <StartOver weekStart={weekStart} part="workouts" onPlan={replace} />
            </div>
          </>
        )
      })()}
    </AppShell>
  )
}
