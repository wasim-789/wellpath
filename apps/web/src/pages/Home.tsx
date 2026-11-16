/**
 * Signed-in dashboard: sends new users to onboarding, then shows today first
 * (meals and workout, with one clear next step), the week at a glance and the daily targets.
 */
import { useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { workoutReasonText, type DailyTargets, type MealPlan, type PlannedMeal, type WorkoutPlan } from '@wellpath/engine'
import { AppShell, Notice } from '../components/app/AppShell'
import { Icon, type IconName } from '../components/app/Icon'
import { useAuth } from '../lib/auth'
import { DIET_OPTIONS, GOAL_OPTIONS, labelOf } from '../lib/labels'
import { MEAL_LABEL, SLOT_STYLE, useMealPlan } from '../lib/meals'
import { useProfile } from '../lib/profile'
import { setMealEaten, useProgress, type DayProgress, type WeekProgress } from '../lib/progress'
import { dayDate, todayIndex } from '../lib/week'
import { FOCUS_LABEL, LEVEL_LABEL, useWorkoutPlan } from '../lib/workouts'

type Loaded<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: { weekStart: string; plan: T } }


function greeting(hour: number) {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const weekday = (weekStart: string, day: number) => dayDate(weekStart, day).toLocaleDateString('en-GB', { weekday: 'long' })

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-ink-2 ${className}`} />
}

function CardHeader({ icon, tint, title, sub, action }: { icon: IconName; tint: string; title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon name={icon} /></span>
        <div>
          <h2 className="text-base font-bold text-heading">{title}</h2>
          {sub && <p className="text-xs text-muted">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-800" role="alert">
      <Icon name="info" className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button type="button" onClick={retry} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100">Try again</button>
    </div>
  )
}

/* ---------- hero ---------- */

function Hero({ now, name, chips, meals, workouts, targets }: {
  now: Date
  name: string
  chips: string[]
  meals: Loaded<MealPlan>
  workouts: Loaded<WorkoutPlan>
  targets: DailyTargets
}) {
  const today = todayIndex()
  const session = workouts.status === 'ready' ? workouts.data.plan.days[today].session : undefined
  const planned = meals.status === 'ready' ? meals.data.plan.days[today].totals.kcal : null
  const share = planned === null ? 0 : Math.min(1, planned / targets.calories)
  const R = 46
  const full = 2 * Math.PI * R

  let summary = 'Getting today ready…'
  if (workouts.status === 'ready') {
    summary = session
      ? `Today is a ${FOCUS_LABEL[session.focus].toLowerCase()} day: about ${session.minutes} minutes at home, plus your meals.`
      : 'Today is a rest day. Your meals are planned, and your body gets time to recover.'
  }

  return (
    <section className="bg-deep relative overflow-hidden rounded-3xl p-6 text-white shadow-xl shadow-indigo-900/20 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-fuchsia-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />

      <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-sm font-medium text-indigo-200">
            <Icon name="sun" className="h-4 w-4" />
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{greeting(now.getHours())}, {name}</h1>
          <p className="mt-2 text-indigo-100">{summary}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {chips.map((c) => <span key={c} className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/20">{c}</span>)}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {session ? (
              <Link to={`/workouts?day=${today}`} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-5 py-3 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-900/30 transition hover:-translate-y-0.5 hover:shadow-xl">
                <Icon name="play" className="h-4 w-4" strokeWidth={2.2} /> Start today's workout
              </Link>
            ) : (
              <Link to={`/meals?day=${today}`} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 px-5 py-3 text-sm font-bold text-emerald-950 shadow-lg shadow-emerald-900/30 transition hover:-translate-y-0.5 hover:shadow-xl">
                <Icon name="bowl" className="h-4 w-4" strokeWidth={2.2} /> See today's meals
              </Link>
            )}
            <Link to="/week" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/20">
              <Icon name="calendar" className="h-4 w-4" /> Plan for the week
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-5 self-start rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur md:self-auto">
          <svg viewBox="0 0 110 110" className="h-28 w-28 -rotate-90" role="img" aria-label={planned === null ? 'Loading today’s calories' : `${planned} of ${targets.calories} kcal planned today`}>
            <circle cx="55" cy="55" r={R} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="10" />
            <circle
              cx="55" cy="55" r={R} fill="none" stroke="url(#hero-ring)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={full} strokeDashoffset={full * (1 - share)} className="ring-anim" style={{ ['--ring-full' as string]: full }}
            />
            <defs>
              <linearGradient id="hero-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6ee7b7" /><stop offset="1" stopColor="#5eead4" /></linearGradient>
            </defs>
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">Planned today</p>
            <p className="text-2xl font-extrabold tabular-nums">{planned === null ? '…' : planned.toLocaleString()}</p>
            <p className="text-xs text-indigo-200">of {targets.calories.toLocaleString()} kcal target</p>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- stats ---------- */

function Stat({ icon, tint, label, value, unit, sub }: { icon: IconName; tint: string; label: string; value: ReactNode; unit?: string; sub?: string }) {
  return (
    <div className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tint}`}><Icon name={icon} /></span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted">{label}</p>
        <p className="text-xl font-extrabold tabular-nums text-heading">{value}{unit && <span className="ml-1 text-sm font-semibold text-muted">{unit}</span>}</p>
        {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
      </div>
    </div>
  )
}

function Stats({ targets, workouts }: { targets: DailyTargets; workouts: Loaded<WorkoutPlan> }) {
  const plan = workouts.status === 'ready' ? workouts.data.plan : null
  const session = plan?.days[todayIndex()].session
  const total = plan ? plan.days.reduce((t, d) => t + (d.session?.minutes ?? 0), 0) : 0
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Stat icon="flame" tint="bg-orange-100 text-orange-500" label="Daily calories" value={targets.calories.toLocaleString()} unit="kcal" />
      <Stat icon="target" tint="bg-violet/10 text-violet" label="Daily protein" value={targets.proteinG} unit="g" sub={`Carbs ${targets.carbsG} g · Fat ${targets.fatG} g`} />
      <Stat icon="clock" tint="bg-amber-100 text-amber-600" label="Today's workout" value={plan ? (session ? session.minutes : 'Rest') : '…'} unit={session ? 'min' : undefined} sub={session ? `About ${session.kcal} kcal` : plan ? 'Recovery day' : undefined} />
      <Stat icon="calendar" tint="bg-emerald-100 text-emerald-600" label="This week" value={plan ? plan.daysPerWeek : '…'} unit="workouts" sub={plan ? `${total} min in total` : undefined} />
    </div>
  )
}

/* ---------- today's meals ---------- */

/** One meal, with a tick-box to mark it as eaten straight from the dashboard. */
function MealRow({ meal, eaten }: { meal: PlannedMeal; eaten?: boolean }) {
  const { icon, tint } = SLOT_STYLE[meal.slot]
  const canTick = eaten !== undefined && meal.items.length > 0
  return (
    <li className={`flex items-center gap-3 py-3 transition ${eaten ? 'opacity-70' : ''}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon name={icon} className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          {MEAL_LABEL[meal.slot]}
          {meal.swapped && <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[10px] normal-case tracking-normal text-mint">Your pick</span>}
        </p>
        <p className="truncate text-sm font-medium text-heading">{meal.items.length ? meal.items.map((i) => i.name).join(', ') : 'Nothing suitable yet'}</p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-heading">{Math.round(meal.totals.kcal)}<span className="ml-0.5 text-xs font-normal text-muted">kcal</span></p>
      {canTick && (
        <button
          type="button" aria-pressed={eaten} onClick={() => void setMealEaten(todayIndex(), meal.slot, !eaten)}
          aria-label={eaten ? `Mark ${MEAL_LABEL[meal.slot].toLowerCase()} as not eaten` : `Mark ${MEAL_LABEL[meal.slot].toLowerCase()} as eaten`}
          title={eaten ? 'Eaten. Tap to undo' : 'Mark as eaten'}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${eaten ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line text-transparent hover:border-emerald-400 hover:text-emerald-400'}`}
        >
          <Icon name="check" className="h-4 w-4" strokeWidth={3} />
        </button>
      )}
    </li>
  )
}

function TodayMeals({ state, retry, progress }: { state: Loaded<MealPlan>; retry: () => void; progress?: DayProgress }) {
  const today = state.status === 'ready' ? state.data.plan.days[todayIndex()] : null
  return (
    <section className="card p-5 sm:p-6">
      <CardHeader
        icon="bowl" tint="bg-emerald-100 text-emerald-600" title="Today's meals"
        sub={today ? `${today.totals.kcal.toLocaleString()} kcal · ${Math.round(today.totals.proteinG)} g protein` : 'Planned for your diet and health'}
        action={<Link to={`/meals?day=${todayIndex()}`} className="hidden text-sm font-semibold text-violet hover:underline sm:inline">Full day</Link>}
      />
      {state.status === 'loading' && <div className="mt-4 space-y-3" role="status" aria-label="Loading your meals">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
      {state.status === 'error' && <LoadError message={state.message} retry={retry} />}
      {today && (
        <>
          {progress && <p className="mt-3 text-xs text-muted">Tick each meal once you've eaten it.</p>}
          <ul className="mt-1 divide-y divide-line">{today.meals.map((m) => <MealRow key={m.slot} meal={m} eaten={progress ? progress.meals.includes(m.slot) : undefined} />)}</ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/meals?day=${todayIndex()}`} className="btn-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white">
              See portions <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
            <Link to={`/meals?day=${todayIndex()}`} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-heading hover:bg-ink-2">
              <Icon name="swap" className="h-4 w-4 text-violet" /> Change a meal
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

/* ---------- today's workout ---------- */

function TodayWorkout({ state, retry, progress }: { state: Loaded<WorkoutPlan>; retry: () => void; progress?: DayProgress }) {
  const t = todayIndex()
  const plan = state.status === 'ready' ? state.data.plan : null
  const day = plan?.days[t]
  const s = day?.session
  const next = plan?.days.find((d) => d.day > t && d.session)
  const done = progress?.workout?.done ?? 0
  const total = progress?.workout?.total ?? 0
  const complete = progress?.workout?.complete ?? false

  return (
    <section className="card p-5 sm:p-6">
      <CardHeader
        icon="dumbbell" tint="bg-violet/10 text-violet" title="Today's workout"
        sub={s ? `${FOCUS_LABEL[s.focus]} · ${LEVEL_LABEL[plan!.level]} level` : day ? 'Rest and recover' : 'Home exercises, no equipment needed'}
        action={s && <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">{s.minutes} min</span>}
      />
      {state.status === 'loading' && <div className="mt-4 space-y-3" role="status" aria-label="Loading your workout"><Skeleton className="h-10" /><Skeleton className="h-24" /></div>}
      {state.status === 'error' && <LoadError message={state.message} retry={retry} />}

      {s && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Warm-up', s.warmup.length],
              ['Workout', s.main.length],
              ['Cool-down', s.cooldown.length],
            ].map(([label, n], i) => (
              <div key={label} className={`rounded-xl p-2.5 ${i === 1 ? 'bg-violet/10 text-violet' : 'bg-ink-2 text-heading'}`}>
                <p className="text-lg font-extrabold tabular-nums">{n}</p>
                <p className="text-[11px] font-semibold">{label} {Number(n) === 1 ? 'move' : 'moves'}</p>
              </div>
            ))}
          </div>
          <ol className="mt-4 space-y-2">
            {s.main.map((e, i) => (
              <li key={e.slug} className="flex items-center gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-3 text-xs font-bold text-violet">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-heading">{e.name}</span>
                <span className="shrink-0 text-xs text-muted">{e.amount}</span>
              </li>
            ))}
          </ol>
          {done > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs font-semibold"><span className="text-emerald-700">{complete ? 'Workout complete. Well done!' : 'In progress'}</span><span className="tabular-nums text-muted">{done} of {total} moves</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-2"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} /></div>
            </div>
          )}
          <Link to={`/workouts?day=${t}`} className={`mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${complete ? 'bg-emerald-50 text-emerald-700 ring-2 ring-emerald-300' : 'btn-primary text-white'}`}>
            <Icon name={complete ? 'checkCircle' : 'play'} className="h-4 w-4" strokeWidth={2.2} /> {complete ? 'Workout done. See it' : done > 0 ? 'Continue workout' : 'Start workout'}
          </Link>
        </>
      )}

      {day && !s && (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 p-5">
          <p className="flex items-start gap-3 text-sm text-heading">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-violet shadow-sm"><Icon name="moon" className="h-[18px] w-[18px]" /></span>
            <span>{workoutReasonText(day.reasons[0])}</span>
          </p>
          {next && plan && state.status === 'ready' && (
            <Link to={`/workouts?day=${next.day}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet hover:underline">
              Next workout: {weekday(state.data.weekStart, next.day)} <Icon name="arrowRight" className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

/* ---------- the week ---------- */

function WeekGlance({ meals, workouts }: { meals: Loaded<MealPlan>; workouts: Loaded<WorkoutPlan> }) {
  const t = todayIndex()
  const ready = meals.status === 'ready' && workouts.status === 'ready'
  return (
    <section className="card p-5">
      <CardHeader icon="calendar" tint="bg-sky-100 text-sky-600" title="Your week" sub="Tap a day to open its workout"
        action={<Link to="/week" className="text-sm font-semibold text-violet hover:underline">See all</Link>} />
      {!ready && <Skeleton className="mt-4 h-20" />}
      {ready && (
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {workouts.data.plan.days.map((d) => {
            const date = dayDate(workouts.data.weekStart, d.day)
            const today = d.day === t
            const past = d.day < t
            return (
              <Link
                key={d.day} to={`/workouts?day=${d.day}`}
                title={`${date.toLocaleDateString('en-GB', { weekday: 'long' })}: ${d.session ? `${FOCUS_LABEL[d.session.focus]}, ${d.session.minutes} min` : 'rest day'}`}
                className={`flex flex-col items-center rounded-xl py-2 transition hover:-translate-y-0.5 ${
                  today ? 'btn-primary text-white shadow-md' : past ? 'bg-ink-2/60 text-muted' : 'bg-ink-2 text-heading hover:bg-ink-3'}`}
              >
                <span className={`text-[10px] font-semibold uppercase ${today ? 'text-indigo-100' : 'text-muted'}`}>{date.toLocaleDateString('en-GB', { weekday: 'narrow' })}</span>
                <span className="text-sm font-bold">{date.getDate()}</span>
                <Icon name={d.session ? 'dumbbell' : 'moon'} className={`mt-1 h-3.5 w-3.5 ${today ? 'text-white' : d.session ? 'text-violet' : 'text-muted/70'}`} />
              </Link>
            )
          })}
        </div>
      )}
      {ready && (
        <p className="mt-3 flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1"><Icon name="dumbbell" className="h-3.5 w-3.5 text-violet" /> Workout</span>
          <span className="flex items-center gap-1"><Icon name="moon" className="h-3.5 w-3.5" /> Rest</span>
        </p>
      )}
    </section>
  )
}

/* ---------- targets ---------- */

function Targets({ targets }: { targets: DailyTargets }) {
  const macros = [
    { k: 'Protein', g: targets.proteinG, kcal: targets.proteinG * 4, bar: 'bg-lilac' },
    { k: 'Carbs', g: targets.carbsG, kcal: targets.carbsG * 4, bar: 'bg-sky-500' },
    { k: 'Fat', g: targets.fatG, kcal: targets.fatG * 9, bar: 'bg-amber' },
  ]
  const sum = macros.reduce((t, m) => t + m.kcal, 0) || 1
  return (
    <section className="card p-5">
      <CardHeader icon="target" tint="bg-orange-100 text-orange-500" title="Daily targets" sub={`${targets.calories.toLocaleString()} kcal a day`} />
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-ink-2">
        {macros.map((m) => <div key={m.k} className={`bar-anim ${m.bar}`} style={{ width: `${(m.kcal / sum) * 100}%` }} />)}
      </div>
      <ul className="mt-4 space-y-2.5">
        {macros.map((m) => (
          <li key={m.k} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-text"><span className={`h-2.5 w-2.5 rounded-full ${m.bar}`} />{m.k}</span>
            <span className="tabular-nums"><span className="font-bold text-heading">{m.g} g</span><span className="ml-2 text-xs text-muted">{Math.round((m.kcal / sum) * 100)}%</span></span>
          </li>
        ))}
      </ul>
      <details className="group mt-4 rounded-xl border border-line bg-ink-2/50 p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
          Why these numbers
          <Icon name="chevronDown" className="h-4 w-4 transition group-open:rotate-180" />
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-text">
          {targets.reasons.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-lilac" />{r}</li>)}
        </ul>
      </details>
    </section>
  )
}

function QuickActions() {
  const items: { to: string; icon: IconName; label: string; sub: string; tint: string }[] = [
    { to: '/onboarding', icon: 'edit', label: 'Edit my answers', sub: 'Goal, diet, health, time', tint: 'bg-violet/10 text-violet' },
    { to: '/week', icon: 'calendar', label: 'Plan for the week', sub: 'Every day at a glance', tint: 'bg-sky-100 text-sky-600' },
    { to: '/settings', icon: 'settings', label: 'Settings', sub: 'Account and privacy', tint: 'bg-ink-2 text-heading' },
  ]
  return (
    <section className="card p-2">
      <ul>
        {items.map((a) => (
          <li key={a.to}>
            <Link to={a.to} className="group flex items-center gap-3 rounded-2xl p-3 transition hover:bg-ink-2">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${a.tint}`}><Icon name={a.icon} className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-heading">{a.label}</span>
                <span className="block truncate text-xs text-muted">{a.sub}</span>
              </span>
              <Icon name="arrowRight" className="h-4 w-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-violet" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- progress ---------- */

function Ring({ value, total, color, children }: { value: number; total: number; color: string; children: ReactNode }) {
  const R = 26
  const full = 2 * Math.PI * R
  const share = total ? Math.min(1, value / total) : 0
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="#eef2ff" strokeWidth="7" />
        <circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={full} strokeDashoffset={full * (1 - share)} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </div>
  )
}

/** Today's workout and meals ticked off, the streak, and the week so far. */
function TodayProgress({ p }: { p: WeekProgress }) {
  const today = p.days[todayIndex()]!
  const w = today.workout
  const allDone = (!w || w.complete) && today.eaten.total > 0 && today.eaten.done === today.eaten.total
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><Icon name="checkCircle" /></span>
          <div>
            <h2 className="text-base font-bold text-heading">Today's progress</h2>
            <p className="text-xs text-muted">{allDone ? 'Everything done today. Brilliant!' : 'Saved to your account'}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-extrabold ${p.streak.current ? 'bg-orange-100 text-orange-600' : 'bg-ink-2 text-muted'}`} title={`Best streak: ${p.streak.best} days`}>
          <Icon name="flame" className="h-4 w-4" />{p.streak.current}<span className="text-xs font-semibold">day streak</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5">
        <div className="flex items-center gap-3">
          <Ring value={w?.done ?? 0} total={w?.total ?? 0} color="#4f46e5">
            {w ? <span className="text-sm font-extrabold tabular-nums text-heading">{w.done}/{w.total}</span> : <Icon name="moon" className="h-5 w-5 text-muted" />}
          </Ring>
          <div className="min-w-0">
            <p className="text-sm font-bold text-heading">Workout</p>
            <p className="text-xs text-muted">{!w ? 'Rest day' : w.complete ? 'Done!' : `${w.total - w.done} moves to go`}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Ring value={today.eaten.done} total={today.eaten.total} color="#10b981">
            <span className="text-sm font-extrabold tabular-nums text-heading">{today.eaten.done}/{today.eaten.total}</span>
          </Ring>
          <div className="min-w-0">
            <p className="text-sm font-bold text-heading">Meals</p>
            <p className="text-xs text-muted">{today.eaten.done === today.eaten.total ? 'All eaten' : `${today.eaten.total - today.eaten.done} to go`}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs">
        <span className="text-muted">This week: <span className="font-semibold text-heading">{p.week.workoutsDone} of {p.week.workoutsPlanned}</span> workouts · <span className="font-semibold text-heading">{p.week.mealsEaten} of {p.week.mealsPlanned}</span> meals</span>
        <Link to="/week" className="font-semibold text-violet hover:underline">See the week</Link>
      </div>
    </section>
  )
}

/* ---------- page ---------- */

export function Home() {
  const auth = useAuth()
  const { state, retry } = useProfile()
  const meals = useMealPlan()
  const workouts = useWorkoutPlan()
  const progress = useProgress(meals.state.status === 'ready' ? meals.state.data.plan : null)
  const todayProgress = progress.status === 'ready' ? progress.data.days[todayIndex()] : undefined
  const [now] = useState(() => new Date())
  const firstName = auth.status === 'signed-in' ? auth.user.name.split(' ')[0] : ''

  if (state.status === 'ready' && !state.data.profile) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      {state.status === 'loading' && (
        <div className="space-y-4" role="status" aria-label="Loading your dashboard">
          <Skeleton className="h-56 rounded-3xl" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          <Skeleton className="h-72" />
        </div>
      )}

      {state.status === 'error' && (
        <div className="card p-6" role="alert">
          <p className="text-sm text-heading">{state.message}</p>
          <button type="button" onClick={retry} className="btn-primary mt-4 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">Try again</button>
        </div>
      )}

      {state.status === 'ready' && state.data.profile && state.data.targets && (() => {
        const { profile, targets, notices } = state.data
        const chips = [`Goal: ${labelOf(GOAL_OPTIONS, profile.goal)}`, labelOf(DIET_OPTIONS, profile.dietType), `${profile.workoutMinutes} min workouts`]
        return (
          <div className="pop space-y-6">
            <Notice tone="amber" title="Important" items={targets.warnings} />
            <Hero now={now} name={firstName} chips={chips} meals={meals.state} workouts={workouts.state} targets={targets} />
            <Stats targets={targets} workouts={workouts.state} />

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <TodayWorkout state={workouts.state} retry={workouts.retry} progress={todayProgress} />
                <TodayMeals state={meals.state} retry={meals.retry} progress={todayProgress} />
              </div>
              <div className="space-y-6">
                {progress.status === 'ready' && <TodayProgress p={progress.data} />}
                <WeekGlance meals={meals.state} workouts={workouts.state} />
                <Targets targets={targets} />
                <QuickActions />
                <Notice tone="blue" title="Safety notes for your workouts" items={notices} />
              </div>
            </div>

            <p className="text-center text-xs text-muted lg:hidden">Wellness guidance only. Not medical advice.</p>
          </div>
        )
      })()}
    </AppShell>
  )
}
