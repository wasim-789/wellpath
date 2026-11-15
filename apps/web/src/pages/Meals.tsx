/** This week's meals, one day at a time, with the reasons behind each choice. */
import { useState } from 'react'
import { Link, Navigate } from 'react-router'
import { reasonText } from '@wellpath/engine'
import { AppShell, Notice } from '../components/app/AppShell'
import { MealCard } from '../components/app/MealCard'
import { dayDate, todayIndex, useMealPlan } from '../lib/meals'

export function Meals() {
  const { state, retry, replace } = useMealPlan()
  const [picked, setPicked] = useState<number | null>(null)
  const day = picked ?? todayIndex()

  if (state.status === 'error' && /onboarding/i.test(state.message)) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      <Link to="/app" className="text-sm font-semibold text-violet hover:underline">← Home</Link>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-heading">Your meals this week</h1>

      {state.status === 'loading' && <p className="mt-8 text-sm text-muted" role="status">Planning your meals…</p>}

      {state.status === 'error' && (
        <div className="card mt-8 p-6" role="alert">
          <p className="text-sm text-heading">{state.message}</p>
          <button type="button" onClick={retry} className="btn-primary mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      )}

      {state.status === 'ready' && (() => {
        const { plan, weekStart } = state.data
        const current = plan.days[day]
        return (
          <>
            <p className="mt-2 text-muted">
              Aiming for <span className="font-semibold text-heading">{plan.target.calories.toLocaleString()} kcal</span> and{' '}
              <span className="font-semibold text-heading">{plan.target.proteinG} g protein</span> a day.
            </p>

            <div className="mt-6 grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist" aria-label="Day of the week">
              {plan.days.map((d) => {
                const date = dayDate(weekStart, d.day)
                const active = d.day === day
                return (
                  <button
                    key={d.day} type="button" role="tab" aria-selected={active} onClick={() => setPicked(d.day)}
                    className={`rounded-xl border px-1 py-2 text-center transition ${active ? 'border-violet bg-white shadow-sm' : 'border-line bg-white/60 hover:bg-white'}`}
                  >
                    <span className={`block text-xs font-semibold ${active ? 'text-violet' : 'text-muted'}`}>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                    <span className="block text-lg font-bold text-heading">{date.getDate()}</span>
                    {d.day === todayIndex() && <span className="block text-[10px] font-semibold uppercase text-mint">Today</span>}
                  </button>
                )
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-heading">{dayDate(weekStart, day).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
              <p className="text-sm text-muted">
                <span className="font-semibold tabular-nums text-heading">{current.totals.kcal.toLocaleString()} kcal</span> · {Math.round(current.totals.proteinG)} g protein ·{' '}
                {Math.round(current.totals.carbsG)} g carbs · {Math.round(current.totals.fatG)} g fat
              </p>
            </div>
            <p className="mt-1 text-sm text-muted">Not in the mood for something? Change any meal and pick from a few others that fit.</p>
            <div className="mt-3 space-y-2">
              {current.reasons.map((r) => <p key={r.code} className={`text-sm ${r.code === 'day_on_target' ? 'text-muted' : 'text-amber-800'}`}>{reasonText(r)}</p>)}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {current.meals.map((m) => <MealCard key={`${day}-${m.slot}`} meal={m} swap={{ weekStart, day, onPlan: replace }} />)}
            </div>

            <div className="mt-8">
              <Notice tone="blue" title="How this plan was made" items={plan.reasons.map(reasonText)} />
            </div>
          </>
        )
      })()}
    </AppShell>
  )
}
