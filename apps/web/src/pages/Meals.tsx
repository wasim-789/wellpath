/** This week's meals, one day at a time, with the day's totals against the targets and the reasons behind each choice. */
import { Navigate, useSearchParams } from 'react-router'
import { reasonText, type PlannedDay } from '@wellpath/engine'
import { AppShell, Notice } from '../components/app/AppShell'
import { DayTabs } from '../components/app/DayTabs'
import { Icon } from '../components/app/Icon'
import { FoodLogger, LoggedFoods } from '../components/app/FoodLogger'
import { MealCard } from '../components/app/MealCard'
import { MiniStat, PageHeader } from '../components/app/PageHeader'
import { StartOver } from '../components/app/StartOver'
import { DIET_OPTIONS, labelOf } from '../lib/labels'
import { useMealPlan } from '../lib/meals'
import { isFuture, setMealEaten, useProgress, type DayProgress } from '../lib/progress'
import { dayDate, dayFromQuery, todayIndex } from '../lib/week'

function Bar({ label, value, target, unit, color }: { label: string; value: number; target?: number; unit: string; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 100
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-text">{label}</span>
        <span className="tabular-nums"><span className="font-bold text-heading">{Math.round(value).toLocaleString()}</span>{target ? <span className="text-muted"> / {target.toLocaleString()} {unit}</span> : <span className="text-muted"> {unit}</span>}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-2"><div className={`bar-anim h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

function DaySummary({ date, day, target, today, progress }: { date: Date; day: PlannedDay; target: { calories: number; proteinG: number }; today: boolean; progress?: DayProgress }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-bold text-heading">
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          {today && <span className="rounded-full bg-mint/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Today</span>}
        </h2>
        <p className="text-sm text-muted">{day.meals.length} meals planned</p>
      </div>
      {progress && progress.eaten.total > 0 && (
        <div className="mt-4 rounded-xl bg-emerald-50/70 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 font-semibold text-emerald-800"><Icon name="checkCircle" className="h-4 w-4" />Meals eaten</span>
            <span className="font-bold tabular-nums text-emerald-800">{progress.eaten.done} of {progress.eaten.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: (progress.eaten.done / progress.eaten.total) * 100 + '%' }} /></div>
        </div>
      )}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Bar label="Calories" value={day.totals.kcal} target={target.calories} unit="kcal" color="bg-gradient-to-r from-orange-400 to-amber-400" />
        <Bar label="Protein" value={day.totals.proteinG} target={target.proteinG} unit="g" color="bg-lilac" />
        <Bar label="Carbs" value={day.totals.carbsG} unit="g" color="bg-sky-500" />
        <Bar label="Fat" value={day.totals.fatG} unit="g" color="bg-amber" />
      </div>
      {day.reasons.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
          {day.reasons.map((r) => {
            const good = r.code === 'day_on_target'
            return (
              <li key={r.code} className={`flex items-start gap-2 ${good ? 'text-emerald-700' : 'text-amber-800'}`}>
                <Icon name={good ? 'checkCircle' : 'info'} className="mt-0.5 h-4 w-4 shrink-0" />{reasonText(r)}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function Meals() {
  const { state, retry, replace } = useMealPlan()
  // Reloads when the plan changes, since progress is counted against it.
  const saved = useProgress(state.status === 'ready' ? state.data.plan : null)
  const [params, setParams] = useSearchParams()
  // The day lives in the URL, so links, tabs and the back button all agree.
  const day = dayFromQuery(params.get('day'))
  const pick = (d: number) => setParams({ day: String(d) }, { replace: true })

  if (state.status === 'error' && /onboarding/i.test(state.message)) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      <PageHeader icon="bowl" tint="bg-emerald-100 text-emerald-600" title="Your meals" sub="Local dishes planned for your goal, diet and health." back={{ to: '/week', label: 'Your week' }} />

      {state.status === 'loading' && (
        <div className="mt-6 space-y-4" role="status" aria-label="Planning your meals">
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white" />)}</div>
          <div className="h-20 animate-pulse rounded-2xl bg-white" />
          <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-white" />)}</div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="card mt-6 p-6" role="alert">
          <p className="text-sm text-heading">{state.message}</p>
          <button type="button" onClick={retry} className="btn-primary mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      )}

      {state.status === 'ready' && (() => {
        const { plan, weekStart } = state.data
        const current = plan.days[day]
        return (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MiniStat icon="flame" tint="bg-orange-100 text-orange-500" label="Daily calories" value={`${plan.target.calories.toLocaleString()} kcal`} />
              <MiniStat icon="target" tint="bg-violet/10 text-violet" label="Daily protein" value={`${plan.target.proteinG} g`} />
              <div className="col-span-2 sm:col-span-1"><MiniStat icon="heart" tint="bg-emerald-100 text-emerald-600" label="Your diet" value={labelOf(DIET_OPTIONS, plan.dietType)} /></div>
            </div>

            <DayTabs weekStart={weekStart} value={day} onChange={pick} />

            <DaySummary date={dayDate(weekStart, day)} day={current} target={plan.target} today={day === todayIndex()} progress={saved.status === 'ready' ? saved.data.days[day] : undefined} />

            {saved.status === 'ready' && (
              <section className="card p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet/10 text-violet"><Icon name="edit" /></span>
                  <div>
                    <h2 className="font-bold text-heading">Log what you ate</h2>
                    <p className="text-xs text-muted">Something not on the plan? Type it in Roman Urdu or English, like “2 roti aur daal”.</p>
                  </div>
                  {saved.data.days[day]!.intake.kcal > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold tabular-nums text-orange-700">{saved.data.days[day]!.intake.kcal.toLocaleString()} kcal eaten</span>
                  )}
                </div>
                <div className="mt-4 space-y-4">
                  <FoodLogger key={day} day={day} locked={isFuture(saved.data, day)} />
                  <LoggedFoods day={day} progress={saved.data.days[day]!} />
                </div>
              </section>
            )}

            <div>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-lg font-bold text-heading">Meals for the day</h2>
                <p className="flex items-center gap-1.5 text-sm text-muted"><Icon name="swap" className="h-4 w-4 text-violet" />Not in the mood? Change any meal.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {current.meals.map((m) => (
                  <MealCard
                    key={`${day}-${m.slot}`} meal={m} swap={{ weekStart, day, onPlan: replace }}
                    eaten={saved.status === 'ready' ? { value: saved.data.days[day]!.meals.includes(m.slot), locked: isFuture(saved.data, day), onChange: (v) => void setMealEaten(day, m.slot, v) } : undefined}
                  />
                ))}
              </div>
            </div>

            <Notice tone="blue" title="How this plan was made" items={plan.reasons.map(reasonText)} />
            <StartOver weekStart={weekStart} part="meals" onPlan={replace} />
          </div>
        )
      })()}
    </AppShell>
  )
}
