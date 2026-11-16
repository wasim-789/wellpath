/**
 * The whole week at a glance: totals for the week, a day-by-day chart of planned calories with
 * workout and rest days, and a card per day with its workout and meals, linking to the details.
 */
import { Link, Navigate } from 'react-router'
import type { MealPlan, PlannedDay, WorkoutDay, WorkoutPlan } from '@wellpath/engine'
import { AppShell } from '../components/app/AppShell'
import { Icon } from '../components/app/Icon'
import { MiniStat, PageHeader } from '../components/app/PageHeader'
import { MEAL_LABEL, SLOT_STYLE, useMealPlan } from '../lib/meals'
import { finishedCount } from '../lib/progress'
import { dayDate, todayIndex } from '../lib/week'
import { FOCUS_LABEL, useWorkoutPlan } from '../lib/workouts'

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o)

function range(weekStart: string) {
  const a = dayDate(weekStart, 0)
  const b = dayDate(weekStart, 6)
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${fmt(b, { day: 'numeric', month: 'long' })}`
    : `${fmt(a, { day: 'numeric', month: 'short' })} – ${fmt(b, { day: 'numeric', month: 'short' })}`
}

/** Planned calories per day against the target, with a workout or rest icon. Tapping a day scrolls to its card. */
function WeekChart({ meals, workouts, weekStart }: { meals: MealPlan; workouts: WorkoutPlan; weekStart: string }) {
  const t = todayIndex()
  const max = Math.max(meals.target.calories * 1.15, ...meals.days.map((d) => d.totals.kcal))
  const targetPct = (meals.target.calories / max) * 100
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold text-heading"><Icon name="flame" className="h-5 w-5 text-orange-500" />Calories planned each day</h2>
        <p className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-violet/50" />Target {meals.target.calories.toLocaleString()} kcal</span>
          <span className="flex items-center gap-1"><Icon name="dumbbell" className="h-3.5 w-3.5 text-violet" />Workout</span>
          <span className="flex items-center gap-1"><Icon name="moon" className="h-3.5 w-3.5" />Rest</span>
        </p>
      </div>
      <div className="mt-5 grid grid-cols-7 gap-1 sm:gap-3">
        {meals.days.map((d) => {
          const today = d.day === t
          const workout = workouts.days[d.day].session
          const h = (d.totals.kcal / max) * 100
          return (
            <a key={d.day} href={`#day-${d.day}`} className="group flex flex-col items-center gap-1.5 rounded-xl py-1 transition hover:bg-ink-2/70" aria-label={`${fmt(dayDate(weekStart, d.day), { weekday: 'long' })}: ${d.totals.kcal} kcal, ${workout ? 'workout' : 'rest day'}`}>
              <span className={`text-[10px] font-semibold tabular-nums ${today ? 'text-violet' : 'text-muted'}`}>{d.totals.kcal.toLocaleString()}</span>
              {/* Every column is the same height, so the target segments line up into one dashed line. */}
              <div className="relative flex h-32 w-full items-end justify-center">
                <div className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-violet/40" style={{ bottom: `${targetPct}%` }} aria-hidden="true" />
                <div className={`bar-rise w-3/5 max-w-10 rounded-t-lg ${today ? 'btn-primary' : 'bg-gradient-to-t from-indigo-200 to-violet-300 group-hover:from-indigo-300 group-hover:to-violet-400'}`} style={{ height: `${h}%` }} />
              </div>
              <Icon name={workout ? 'dumbbell' : 'moon'} className={`h-4 w-4 ${workout ? 'text-violet' : 'text-muted/60'}`} />
              <span className={`text-xs font-bold ${today ? 'text-violet' : 'text-heading'}`}>{fmt(dayDate(weekStart, d.day), { weekday: 'short' })}</span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function DayCard({ weekStart, meals, workout, target }: { weekStart: string; meals: PlannedDay; workout: WorkoutDay; target: number }) {
  const t = todayIndex()
  const date = dayDate(weekStart, meals.day)
  const today = meals.day === t
  const past = meals.day < t
  const s = workout.session
  const all = s ? [...s.warmup, ...s.main, ...s.cooldown] : []
  const finished = s ? finishedCount(weekStart, meals.day, all) : 0
  const onTarget = Math.abs(meals.totals.kcal - target) <= target * 0.1

  return (
    <li id={`day-${meals.day}`} className={`card scroll-mt-24 overflow-hidden transition ${today ? 'ring-2 ring-violet shadow-lg shadow-indigo-200/60' : past ? 'opacity-80' : ''}`}>
      <div className="grid md:grid-cols-[9rem_1fr]">
        {/* Date */}
        <div className={`flex items-center gap-3 p-4 md:flex-col md:items-start md:justify-center md:gap-1 md:p-5 ${today ? 'bg-deep text-white' : 'bg-ink-2/70 text-heading'}`}>
          <p className={`text-xs font-bold uppercase tracking-wider ${today ? 'text-indigo-200' : 'text-muted'}`}>{fmt(date, { weekday: 'long' })}</p>
          <p className="text-3xl font-extrabold leading-none md:text-4xl">{date.getDate()}</p>
          <p className={`text-xs ${today ? 'text-indigo-200' : 'text-muted'}`}>{fmt(date, { month: 'long' })}</p>
          {today && <span className="ml-auto rounded-full bg-emerald-400 px-2.5 py-0.5 text-[11px] font-bold text-emerald-950 md:ml-0 md:mt-2">Today</span>}
          {past && !today && <span className="ml-auto text-[11px] font-semibold text-muted md:ml-0 md:mt-2">Earlier</span>}
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          {/* Workout */}
          {s ? (
            <div className="flex flex-col rounded-2xl border border-violet/15 bg-gradient-to-br from-indigo-50 to-violet-50 p-4">
              <div className="flex items-center gap-3">
                <span className="btn-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"><Icon name="dumbbell" /></span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-violet">Workout</p>
                  <p className="truncate font-bold text-heading">{FOCUS_LABEL[s.focus]}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-heading shadow-sm"><Icon name="clock" className="h-3.5 w-3.5 text-amber-500" />{s.minutes} min</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-heading shadow-sm"><Icon name="flame" className="h-3.5 w-3.5 text-orange-500" />~{s.kcal} kcal</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-semibold text-heading shadow-sm"><Icon name="list" className="h-3.5 w-3.5 text-violet" />{all.length} moves</span>
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-text">{s.main.map((e) => e.name).join(' · ')}</p>
              {finished > 0 && (
                <div className="mt-3">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(finished / all.length) * 100}%` }} /></div>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-700">{finished === all.length ? 'Workout complete' : `${finished} of ${all.length} moves done`}</p>
                </div>
              )}
              <Link to={`/workouts?day=${meals.day}`} className={`mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${today ? 'btn-primary text-white' : 'bg-white text-violet shadow-sm hover:bg-ink-3'} ${finished > 0 ? 'mt-3' : 'mt-4'}`}>
                <Icon name="play" className="h-4 w-4" strokeWidth={2.2} />{today ? 'Start workout' : 'Open workout'}
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-start rounded-2xl border border-line bg-ink-2/60 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-violet shadow-sm"><Icon name="moon" /></span>
              <p className="mt-3 font-bold text-heading">Rest day</p>
              <p className="mt-1 text-xs text-muted">Recovery is part of the plan. A gentle walk is fine if you feel like moving.</p>
              <Link to={`/workouts?day=${meals.day}`} className="mt-auto pt-3 text-sm font-semibold text-violet hover:underline">Why rest today?</Link>
            </div>
          )}

          {/* Meals */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Meals</p>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${onTarget ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                {meals.totals.kcal.toLocaleString()} kcal
              </span>
            </div>
            <ul className="mt-2 space-y-1.5">
              {meals.meals.map((m) => {
                const st = SLOT_STYLE[m.slot]
                return (
                  <li key={m.slot} className="flex items-center gap-2.5 rounded-xl px-1 py-1">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${st.tint}`}><Icon name={st.icon} className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-muted">{MEAL_LABEL[m.slot]}</p>
                      <p className="truncate text-sm text-heading">{m.items.length ? m.items.map((i) => i.name).join(', ') : 'Nothing suitable yet'}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{Math.round(m.totals.kcal)}</span>
                  </li>
                )
              })}
            </ul>
            <Link to={`/meals?day=${meals.day}`} className="mt-3 inline-flex items-center gap-2 self-start rounded-xl border-2 border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 hover:bg-emerald-50">
              <Icon name="bowl" className="h-4 w-4" />See meals and portions
            </Link>
          </div>
        </div>
      </div>
    </li>
  )
}

export function Week() {
  const meals = useMealPlan()
  const workouts = useWorkoutPlan()
  const error = [meals.state, workouts.state].find((s) => s.status === 'error')

  if (error?.status === 'error' && /onboarding/i.test(error.message)) return <Navigate to="/onboarding" replace />

  const retry = () => {
    if (meals.state.status === 'error') meals.retry()
    if (workouts.state.status === 'error') workouts.retry()
  }
  const ready = meals.state.status === 'ready' && workouts.state.status === 'ready'

  return (
    <AppShell>
      <PageHeader
        icon="calendar" tint="bg-sky-100 text-sky-600" title="Your week"
        sub={meals.state.status === 'ready' ? `${range(meals.state.data.weekStart)}. Your plan stays the same all week unless you change it.` : 'Your workouts and meals, day by day.'}
        back={{ to: '/app', label: 'Dashboard' }}
      />

      {error?.status === 'error' && (
        <div className="card mt-6 p-6" role="alert">
          <p className="text-sm text-heading">{error.message}</p>
          <button type="button" onClick={retry} className="btn-primary mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      )}

      {!error && !ready && (
        <div className="mt-6 space-y-4" role="status" aria-label="Loading your week">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white" />)}</div>
          <div className="h-56 animate-pulse rounded-2xl bg-white" />
          {[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-white" />)}
        </div>
      )}

      {meals.state.status === 'ready' && workouts.state.status === 'ready' && (() => {
        const mealPlan = meals.state.data.plan
        const workoutPlan = workouts.state.data.plan
        const weekStart = meals.state.data.weekStart
        const sessions = workoutPlan.days.filter((d) => d.session)
        const minutes = sessions.reduce((t, d) => t + (d.session?.minutes ?? 0), 0)
        const avgKcal = Math.round(mealPlan.days.reduce((t, d) => t + d.totals.kcal, 0) / 7)
        const avgProtein = Math.round(mealPlan.days.reduce((t, d) => t + d.totals.proteinG, 0) / 7)
        return (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniStat icon="dumbbell" tint="bg-violet/10 text-violet" label="Workouts" value={`${sessions.length} · ${minutes} min`} />
              <MiniStat icon="flame" tint="bg-orange-100 text-orange-500" label="Avg calories / day" value={`${avgKcal.toLocaleString()} kcal`} />
              <MiniStat icon="target" tint="bg-emerald-100 text-emerald-600" label="Avg protein / day" value={`${avgProtein} g`} />
              <MiniStat icon="moon" tint="bg-sky-100 text-sky-600" label="Rest days" value={String(7 - sessions.length)} />
            </div>

            <WeekChart meals={mealPlan} workouts={workoutPlan} weekStart={weekStart} />

            <div>
              <h2 className="mb-3 text-lg font-bold text-heading">Day by day</h2>
              <ol className="space-y-4">
                {mealPlan.days.map((d) => <DayCard key={d.day} weekStart={weekStart} meals={d} workout={workoutPlan.days[d.day]} target={mealPlan.target.calories} />)}
              </ol>
            </div>
          </div>
        )
      })()}
    </AppShell>
  )
}
