/** This week's home workouts, one day at a time, with how to do each exercise. */
import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { workoutReasonText, type PlannedExercise, type WorkoutSession } from '@wellpath/engine'
import { AppShell, Notice } from '../components/app/AppShell'
import { DayTabs } from '../components/app/DayTabs'
import { FOCUS_LABEL, LEVEL_LABEL, useWorkoutPlan } from '../lib/workouts'
import { dayDate, todayIndex } from '../lib/week'

function ExerciseRow({ e }: { e: PlannedExercise }) {
  return (
    <li className="py-3">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 text-sm">
          <span className="text-heading">
            <span className="font-medium">{e.name}</span>
            <span className="text-muted"> · {e.amount}</span>
            {e.sets > 1 && <span className="text-muted">, rest {e.restSeconds} s</span>}
          </span>
          <span className="shrink-0 text-xs font-semibold text-violet group-open:hidden">How to</span>
          <span className="hidden shrink-0 text-xs font-semibold text-muted group-open:inline">Hide</span>
        </summary>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-text">
          {e.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </details>
    </li>
  )
}

function Block({ title, sub, items }: { title: string; sub: string; items: PlannedExercise[] }) {
  if (!items.length) return null
  const minutes = Math.round(items.reduce((t, e) => t + e.durationSeconds, 0) / 60)
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-heading">{title}</h3>
        <p className="text-sm tabular-nums text-muted">about {Math.max(1, minutes)} min</p>
      </div>
      <p className="text-xs text-muted">{sub}</p>
      <ul className="mt-1 divide-y divide-line">{items.map((e) => <ExerciseRow key={e.slug} e={e} />)}</ul>
    </section>
  )
}

function Session({ session }: { session: WorkoutSession }) {
  return (
    <>
      <div className="mt-3 space-y-1">
        {session.reasons.map((r) => <p key={r.code} className="text-sm text-muted">{workoutReasonText(r)}</p>)}
      </div>
      <div className="mt-4 space-y-4">
        <Block title="Warm-up" sub="Easy moves to get your body ready." items={session.warmup} />
        <Block title="Workout" sub="Go at a steady pace. Breathe out as you push or lift." items={session.main} />
        <Block title="Cool-down" sub="Hold each stretch gently. It should never hurt." items={session.cooldown} />
      </div>
    </>
  )
}

export function Workouts() {
  const { state, retry } = useWorkoutPlan()
  const [picked, setPicked] = useState<number | null>(null)
  const day = picked ?? todayIndex()

  if (state.status === 'error' && /onboarding/i.test(state.message)) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      <Link to="/app" className="text-sm font-semibold text-violet hover:underline">← Home</Link>
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

            {s ? <Session session={s} /> : (
              <div className="card mt-4 p-5">
                {current.reasons.map((r) => <p key={r.code} className="text-sm text-heading">{workoutReasonText(r)}</p>)}
              </div>
            )}

            <div className="mt-8 space-y-4">
              <Notice tone="amber" title="Stay safe" items={['Stop if you feel chest pain, dizziness, or sharp or growing pain, and see a doctor if it does not settle quickly.']} />
              <Notice tone="blue" title="How this plan was made" items={plan.reasons.map(workoutReasonText)} />
            </div>
          </>
        )
      })()}
    </AppShell>
  )
}
