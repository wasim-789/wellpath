/** This week's home workouts, one day at a time: every exercise shown and explained for beginners, with progress for the day. */
import { Link, Navigate, useSearchParams } from 'react-router'
import { workoutReasonText, type PlannedExercise, type WorkoutPlan, type WorkoutSession } from '@wellpath/engine'
import { AppShell, Notice } from '../components/app/AppShell'
import { DayTabs } from '../components/app/DayTabs'
import { ExerciseCard, type Swap } from '../components/app/ExerciseCard'
import { Icon, type IconName } from '../components/app/Icon'
import { MiniStat, PageHeader } from '../components/app/PageHeader'
import { StartOver } from '../components/app/StartOver'
import { useDayProgress } from '../lib/progress'
import { dayDate, dayFromQuery, todayIndex } from '../lib/week'
import { FOCUS_LABEL, LEVEL_LABEL, useWorkoutPlan } from '../lib/workouts'

const BLOCKS: { key: 'warmup' | 'main' | 'cooldown'; title: string; sub: string; icon: IconName; tint: string }[] = [
  { key: 'warmup', title: 'Warm-up', sub: 'Easy moves to get your body ready.', icon: 'sunrise', tint: 'bg-amber-100 text-amber-600' },
  { key: 'main', title: 'Main workout', sub: 'Go at a steady pace. Breathe out as you push or lift.', icon: 'dumbbell', tint: 'bg-violet/10 text-violet' },
  { key: 'cooldown', title: 'Cool-down', sub: 'Hold each stretch gently. It should never hurt.', icon: 'heart', tint: 'bg-sky-100 text-sky-600' },
]

type Progress = { done: Record<string, number>; setSets: (slug: string, sets: number) => void }

function Block({ title, sub, icon, tint, items, start, swap, progress }: {
  title: string; sub: string; icon: IconName; tint: string; items: PlannedExercise[]; start: number; swap: Swap; progress: Progress
}) {
  if (!items.length) return null
  const minutes = Math.max(1, Math.round(items.reduce((t, e) => t + e.durationSeconds, 0) / 60))
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon name={icon} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-heading">{title}</h3>
          <p className="text-xs text-muted">{sub}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-heading shadow-sm ring-1 ring-line">
          {items.length} {items.length === 1 ? 'move' : 'moves'} · {minutes} min
        </span>
      </div>
      <div className="space-y-4">
        {items.map((e, i) => (
          <ExerciseCard key={`${swap.day}-${e.slug}`} e={e} index={start + i} swap={swap} done={progress.done[e.slug] ?? 0} onDone={(n) => progress.setSets(e.slug, n)} />
        ))}
      </div>
    </section>
  )
}

function SessionView({ session, swap, date, today }: { session: WorkoutSession; swap: Swap; date: Date; today: boolean }) {
  const progress = useDayProgress(swap.weekStart, swap.day)
  const all = [...session.warmup, ...session.main, ...session.cooldown]
  const totalSets = all.reduce((t, e) => t + e.sets, 0)
  const doneSets = all.reduce((t, e) => t + Math.min(e.sets, progress.done[e.slug] ?? 0), 0)
  const finished = all.filter((e) => (progress.done[e.slug] ?? 0) >= e.sets).length
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0
  // Exercises are numbered 1, 2, 3… across all three blocks.
  const firstNumber = { warmup: 1, main: 1 + session.warmup.length, cooldown: 1 + session.warmup.length + session.main.length }

  return (
    <>
      <section className="bg-deep relative overflow-hidden rounded-3xl p-5 text-white shadow-lg shadow-indigo-900/20 sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm text-indigo-200">
            {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {today && <span className="rounded-full bg-emerald-400/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">Today</span>}
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">{FOCUS_LABEL[session.focus]} day</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {[
              { icon: 'clock' as const, text: `${session.minutes} min` },
              { icon: 'flame' as const, text: `About ${session.kcal} kcal` },
              { icon: 'list' as const, text: `${all.length} moves` },
            ].map((c) => <span key={c.text} className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 font-semibold ring-1 ring-white/20"><Icon name={c.icon} className="h-4 w-4" />{c.text}</span>)}
          </div>
          <div className="mt-5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">{pct === 100 ? 'Workout complete. Well done!' : 'Your progress'}</span>
              <span className="tabular-nums text-indigo-200">{finished} of {all.length} moves · {pct}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </section>

      {session.reasons.length > 0 && (
        <ul className="card space-y-1.5 p-4 text-sm text-text">
          {session.reasons.map((r) => <li key={r.code} className="flex gap-2"><Icon name="sparkle" className="mt-0.5 h-4 w-4 shrink-0 text-violet" />{workoutReasonText(r)}</li>)}
        </ul>
      )}

      {BLOCKS.map((b) => (
        <Block key={b.key} title={b.title} sub={b.sub} icon={b.icon} tint={b.tint} items={session[b.key]} start={firstNumber[b.key]} swap={swap} progress={progress} />
      ))}
    </>
  )
}

function RestDay({ plan, day, weekStart, date }: { plan: WorkoutPlan; day: number; weekStart: string; date: Date }) {
  const next = plan.days.find((d) => d.day > day && d.session)
  return (
    <section className="card overflow-hidden">
      <div className="bg-gradient-to-br from-indigo-50 to-violet-100 p-6 text-center sm:p-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-violet shadow-md"><Icon name="moon" className="h-8 w-8" /></span>
        <p className="mt-3 text-sm text-muted">{date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <h2 className="mt-1 text-2xl font-extrabold text-heading">Rest day</h2>
        <div className="mx-auto mt-2 max-w-md space-y-1 text-sm text-text">
          {plan.days[day].reasons.map((r) => <p key={r.code}>{workoutReasonText(r)}</p>)}
        </div>
        {next && (
          <Link to={`/workouts?day=${next.day}`} className="btn-primary mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white">
            Next workout: {dayDate(weekStart, next.day).toLocaleDateString('en-GB', { weekday: 'long' })} <Icon name="arrowRight" className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  )
}

export function Workouts() {
  const { state, retry, replace } = useWorkoutPlan()
  const [params, setParams] = useSearchParams()
  // The day lives in the URL, so links, tabs and the back button all agree.
  const day = dayFromQuery(params.get('day'))
  const pick = (d: number) => setParams({ day: String(d) }, { replace: true })

  if (state.status === 'error' && /onboarding/i.test(state.message)) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      <PageHeader icon="dumbbell" tint="bg-violet/10 text-violet" title="Your workouts" sub="Home workouts with a guide for every move. No gym needed." back={{ to: '/week', label: 'Your week' }} />

      {state.status === 'loading' && (
        <div className="mt-6 space-y-4" role="status" aria-label="Planning your workouts">
          <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-white" />)}</div>
          <div className="h-20 animate-pulse rounded-2xl bg-white" />
          <div className="h-40 animate-pulse rounded-3xl bg-white" />
          <div className="h-72 animate-pulse rounded-2xl bg-white" />
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
        const s = plan.days[day].session
        const date = dayDate(weekStart, day)
        return (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <MiniStat icon="calendar" tint="bg-emerald-100 text-emerald-600" label="Per week" value={`${plan.daysPerWeek} workouts`} />
              <MiniStat icon="clock" tint="bg-amber-100 text-amber-600" label="Each" value={`~${plan.minutesPerSession} min`} />
              <MiniStat icon="target" tint="bg-violet/10 text-violet" label="Level" value={LEVEL_LABEL[plan.level]} />
            </div>

            <DayTabs weekStart={weekStart} value={day} onChange={pick} note={(d) => (plan.days[d].session ? { icon: 'dumbbell', text: 'Workout' } : { icon: 'moon', text: 'Rest day' })} />

            {s
              ? <SessionView key={`${weekStart}-${day}`} session={s} swap={{ weekStart, day, onPlan: replace }} date={date} today={day === todayIndex()} />
              : <RestDay plan={plan} day={day} weekStart={weekStart} date={date} />}

            <Notice tone="amber" title="Stay safe" items={['Stop if you feel chest pain, dizziness, or sharp or growing pain, and see a doctor if it does not settle quickly.']} />
            <Notice tone="blue" title="How this plan was made" items={plan.reasons.map(workoutReasonText)} />
            <StartOver weekStart={weekStart} part="workouts" onPlan={replace} />
          </div>
        )
      })()}
    </AppShell>
  )
}
