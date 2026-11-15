/** Signed-in home: sends new users to onboarding, then shows their targets. */
import { Link, Navigate } from 'react-router'
import { AppShell } from '../components/app/AppShell'
import { TargetsCard } from '../components/app/TargetsCard'
import { useAuth } from '../lib/auth'
import { GOAL_OPTIONS, labelOf } from '../lib/labels'
import { MEAL_LABEL, todayIndex, useMealPlan } from '../lib/meals'
import { useProfile } from '../lib/profile'

/** A short list of today's meals, linking to the full week. */
function TodayMeals() {
  const { state, retry } = useMealPlan()
  return (
    <div className="card h-fit p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-heading">Today's meals</h2>
        {state.status === 'ready' && <p className="text-sm tabular-nums text-muted">{state.data.plan.days[todayIndex()].totals.kcal.toLocaleString()} kcal</p>}
      </div>
      {state.status === 'loading' && <p className="mt-3 text-sm text-muted" role="status">Planning your meals…</p>}
      {state.status === 'error' && (
        <p className="mt-3 text-sm text-heading" role="alert">
          {state.message} <button type="button" onClick={retry} className="font-semibold text-violet hover:underline">Try again</button>
        </p>
      )}
      {state.status === 'ready' && (
        <>
          <ul className="mt-4 space-y-3">
            {state.data.plan.days[todayIndex()].meals.map((m) => (
              <li key={m.slot}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{MEAL_LABEL[m.slot]}</p>
                <p className="text-sm text-heading">{m.items.length ? m.items.map((i) => i.name).join(', ') : 'Nothing suitable yet'}</p>
              </li>
            ))}
          </ul>
          <Link to="/meals" className="btn-primary mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white">See portions and the whole week</Link>
        </>
      )}
    </div>
  )
}

export function Home() {
  const auth = useAuth()
  const { state, retry } = useProfile()
  const firstName = auth.status === 'signed-in' ? auth.user.name.split(' ')[0] : ''

  if (state.status === 'ready' && !state.data.profile) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      <h1 className="text-3xl font-extrabold tracking-tight text-heading">Welcome, {firstName}</h1>

      {state.status === 'loading' && <p className="mt-8 text-sm text-muted" role="status">Loading your plan…</p>}

      {state.status === 'error' && (
        <div className="card mt-8 p-6" role="alert">
          <p className="text-sm text-heading">{state.message}</p>
          <button type="button" onClick={retry} className="btn-primary mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      )}

      {state.status === 'ready' && state.data.profile && state.data.targets && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-muted">Goal: <span className="font-semibold text-heading">{labelOf(GOAL_OPTIONS, state.data.profile.goal)}</span></p>
            <Link to="/onboarding" className="text-sm font-semibold text-violet hover:underline">Edit my answers</Link>
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <TargetsCard targets={state.data.targets} notices={state.data.notices} />
            <TodayMeals />
          </div>
        </>
      )}
    </AppShell>
  )
}
