/** The whole week at a glance: each day's workout and meals, linking to the details. */
import { Link, Navigate } from 'react-router'
import { AppShell } from '../components/app/AppShell'
import { MEAL_LABEL, useMealPlan } from '../lib/meals'
import { dayDate, todayIndex } from '../lib/week'
import { FOCUS_LABEL, useWorkoutPlan } from '../lib/workouts'

export function Week() {
  const meals = useMealPlan()
  const workouts = useWorkoutPlan()
  const error = [meals.state, workouts.state].find((s) => s.status === 'error')

  if (error?.status === 'error' && /onboarding/i.test(error.message)) return <Navigate to="/onboarding" replace />

  const retry = () => {
    if (meals.state.status === 'error') meals.retry()
    if (workouts.state.status === 'error') workouts.retry()
  }

  return (
    <AppShell>
      <Link to="/app" className="text-sm font-semibold text-violet hover:underline">← Home</Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-heading">Your week</h1>
      <p className="mt-2 text-muted">Your plan stays the same all week. It changes when you edit your answers or ask for new meals or workouts.</p>

      {error?.status === 'error' && (
        <div className="card mt-8 p-6" role="alert">
          <p className="text-sm text-heading">{error.message}</p>
          <button type="button" onClick={retry} className="btn-primary mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      )}

      {!error && (meals.state.status === 'loading' || workouts.state.status === 'loading') && <p className="mt-8 text-sm text-muted" role="status">Loading your week…</p>}

      {meals.state.status === 'ready' && workouts.state.status === 'ready' && (() => {
        const mealPlan = meals.state.data.plan
        const workoutPlan = workouts.state.data.plan
        const weekStart = meals.state.data.weekStart
        return (
          <ol className="mt-6 space-y-3">
            {mealPlan.days.map((d) => {
              const session = workoutPlan.days[d.day].session
              const today = d.day === todayIndex()
              return (
                <li key={d.day} className={`card p-5 ${today ? 'ring-2 ring-violet/40' : ''}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-bold text-heading">
                      {dayDate(weekStart, d.day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                      {today && <span className="ml-2 align-middle text-[11px] font-semibold uppercase text-mint">Today</span>}
                    </h2>
                    <p className="text-sm tabular-nums text-muted">{d.totals.kcal.toLocaleString()} kcal{session && ` · ${session.minutes} min workout`}</p>
                  </div>

                  <div className="mt-3 grid gap-4 md:grid-cols-[1fr_2fr]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Workout</p>
                      <p className="text-sm text-heading">{session ? FOCUS_LABEL[session.focus] : 'Rest day'}</p>
                      {session && <p className="text-xs text-muted">{session.main.slice(0, 3).map((e) => e.name).join(', ')}{session.main.length > 3 ? '…' : ''}</p>}
                      <Link to={`/workouts?day=${d.day}`} className="mt-1 inline-block text-xs font-semibold text-violet hover:underline">{session ? 'Open the workout' : 'See the rest-day note'}</Link>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Meals</p>
                      <ul className="space-y-0.5 text-sm">
                        {d.meals.map((m) => (
                          <li key={m.slot}>
                            <span className="text-muted">{MEAL_LABEL[m.slot]}: </span>
                            <span className="text-heading">{m.items.length ? m.items.map((i) => i.name).join(', ') : 'Nothing suitable yet'}</span>
                          </li>
                        ))}
                      </ul>
                      <Link to={`/meals?day=${d.day}`} className="mt-1 inline-block text-xs font-semibold text-violet hover:underline">See portions</Link>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )
      })()}
    </AppShell>
  )
}
