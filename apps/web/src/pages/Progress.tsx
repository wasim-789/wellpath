/**
 * Progress over time: log today's weight and water, then see the weight trend, water and consistency
 * (meals eaten and workouts done) as Chart.js charts for the last 7, 30 or 90 days.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { ChartConfiguration } from 'chart.js'
import { AppShell } from '../components/app/AppShell'
import { Chart } from '../components/app/Chart'
import { Icon, type IconName } from '../components/app/Icon'
import { PageHeader } from '../components/app/PageHeader'
import { ApiError } from '../lib/auth'
import { addWater, fetchHistory, removeWeight, saveWeight, useProgress, type History, type WeekProgress } from '../lib/progress'
import { toast } from '../lib/toast'
import { todayIndex } from '../lib/week'

type Range = 7 | 30 | 90
const RANGES: { days: Range; label: string }[] = [{ days: 7, label: '7 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }]

const VIOLET = '#4f46e5'
const LILAC = '#a5b4fc'
const SKY = '#38bdf8'
const EMERALD = '#10b981'

const short = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const longDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })

function Card({ icon, tint, title, sub, action, children }: { icon: IconName; tint: string; title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon name={icon} /></span>
          <div>
            <h2 className="font-bold text-heading">{title}</h2>
            {sub && <p className="text-xs text-muted">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/* ---------- today: weight and water ---------- */

function WeightCard({ p, onSaved }: { p: WeekProgress; onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const todayWeight = p.days[todayIndex()]!.weightKg
  const last = p.lastWeight

  async function submit(e: FormEvent) {
    e.preventDefault()
    const kg = Number(value)
    if (!value || Number.isNaN(kg) || kg < 25 || kg > 300) { toast('Enter your weight in kg, between 25 and 300.', 'error'); return }
    setBusy(true)
    try { await saveWeight(kg); setValue(''); toast('Weight saved.'); onSaved() } catch (err) { toast(err instanceof ApiError ? err.message : 'Could not save your weight.', 'error') } finally { setBusy(false) }
  }

  async function undo() {
    setBusy(true)
    try { await removeWeight(p.today); toast("Today's weigh-in removed."); onSaved() } catch (err) { toast(err instanceof ApiError ? err.message : 'Could not remove it.', 'error') } finally { setBusy(false) }
  }

  return (
    <Card icon="scale" tint="bg-violet/10 text-violet" title="Weight" sub="Weigh yourself in the morning, before breakfast, for the fairest trend.">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{todayWeight !== null ? 'Today' : last ? `Last: ${short(last.date)}` : 'No weigh-ins yet'}</p>
          <p className="text-3xl font-extrabold tabular-nums text-heading">{todayWeight ?? last?.weightKg ?? '—'}<span className="ml-1 text-base font-semibold text-muted">kg</span></p>
        </div>
        {todayWeight !== null && <button type="button" onClick={() => void undo()} disabled={busy} className="text-xs font-semibold text-muted hover:text-rose-600 disabled:opacity-50">Remove today's</button>}
      </div>
      <form onSubmit={(e) => void submit(e)} className="mt-4 flex gap-2">
        <label className="sr-only" htmlFor="weight">Weight in kg</label>
        <input
          id="weight" type="number" inputMode="decimal" step="0.1" min="25" max="300" placeholder={todayWeight !== null ? 'Update today (kg)' : "Today's weight (kg)"}
          value={value} onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-heading outline-none transition focus:border-violet focus:ring-4 focus:ring-violet/10"
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </Card>
  )
}

function WaterCard({ p, onSaved }: { p: WeekProgress; onSaved: () => void }) {
  const day = todayIndex()
  const glasses = p.days[day]!.water
  const goal = p.water.glasses
  const change = (delta: number) => { addWater(day, delta); onSaved() }
  return (
    <Card
      icon="drop" tint="bg-sky-100 text-sky-600" title="Water" sub={p.water.reason}
      action={<span className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold tabular-nums ${glasses >= goal ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>{glasses}/{goal}</span>}
    >
      <div className="flex flex-wrap gap-1.5" aria-hidden="true">
        {Array.from({ length: Math.max(goal, glasses) }, (_, i) => (
          <span key={i} className={`flex h-9 w-7 items-end justify-center rounded-b-lg rounded-t-sm border-2 transition ${i < glasses ? 'border-sky-400 bg-sky-400/80' : 'border-sky-200 bg-white'}`} />
        ))}
      </div>
      <p className="mt-3 text-sm text-text">{glasses >= goal ? 'Goal reached. Well done!' : `${goal - glasses} more ${goal - glasses === 1 ? 'glass' : 'glasses'} (250 ml each) to reach today's goal.`}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => change(1)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600">
          <Icon name="plus" className="h-4 w-4" strokeWidth={2.6} />Add a glass
        </button>
        <button type="button" onClick={() => change(-1)} disabled={glasses === 0} className="inline-flex items-center justify-center rounded-xl border border-line px-3 text-heading hover:bg-ink-2 disabled:opacity-40" aria-label="Remove a glass">
          <Icon name="minus" className="h-4 w-4" strokeWidth={2.6} />
        </button>
      </div>
    </Card>
  )
}

/* ---------- charts ---------- */

function weightChart(h: History): ChartConfiguration {
  const trend = new Map(h.trend.map((t) => [t.date, t.trendKg]))
  return {
    type: 'line',
    data: {
      labels: h.days.map((d) => short(d.date)),
      datasets: [
        { label: 'Trend (7-day average)', data: h.days.map((d) => trend.get(d.date) ?? null), borderColor: VIOLET, backgroundColor: 'rgba(79,70,229,0.08)', fill: true, tension: 0.35, spanGaps: true, pointRadius: 0, borderWidth: 3 },
        { label: 'Weigh-in', data: h.days.map((d) => d.weightKg), borderColor: LILAC, backgroundColor: LILAC, showLine: false, pointRadius: 4, pointHoverRadius: 6 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y} kg` } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grace: '5%', ticks: { callback: (v) => `${v} kg` } } },
    },
  }
}

function waterChart(h: History): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: h.days.map((d) => short(d.date)),
      datasets: [
        { type: 'line', label: `Goal (${h.water.glasses} glasses)`, data: h.days.map(() => h.water.glasses), borderColor: VIOLET, borderDash: [6, 6], borderWidth: 2, pointRadius: 0 },
        { type: 'bar', label: 'Glasses', data: h.days.map((d) => d.water), backgroundColor: h.days.map((d) => (d.water >= h.water.glasses ? EMERALD : SKY)), borderRadius: 6, maxBarThickness: 28 },
      ],
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true, suggestedMax: h.water.glasses + 2, ticks: { stepSize: 2 } } },
    },
  }
}

function consistencyChart(h: History): ChartConfiguration {
  return {
    type: 'bar',
    data: {
      labels: h.days.map((d) => short(d.date)),
      datasets: [
        // Markers only: workout days are not continuous (rest days in between), so a joining line would mislead.
        { type: 'line', label: 'Workout done (%)', yAxisID: 'pct', data: h.days.map((d) => (d.workout ? Math.round((d.workout.done / d.workout.total) * 100) : null)), borderColor: VIOLET, backgroundColor: VIOLET, showLine: false, pointStyle: 'rectRounded', pointRadius: 6, pointHoverRadius: 8 },
        { type: 'bar', label: 'Meals eaten', yAxisID: 'meals', data: h.days.map((d) => d.meals), backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 6, maxBarThickness: 28 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        // A little headroom above 4 meals and 100%, so markers at the top are not cut off.
        meals: { position: 'left', beginAtZero: true, max: 4.6, ticks: { stepSize: 1, callback: (v) => (Number(v) <= 4 ? v : '') }, title: { display: true, text: 'Meals' } },
        pct: { position: 'right', beginAtZero: true, max: 115, grid: { display: false }, ticks: { stepSize: 25, callback: (v) => (Number(v) <= 100 ? `${v}%` : '') } },
      },
    },
  }
}

function Summary({ h }: { h: History }) {
  const first = h.trend[0]
  const last = h.trend.at(-1)
  const change = first && last && first !== last ? Math.round((last.trendKg - first.trendKg) * 10) / 10 : null
  const avgWater = Math.round((h.days.reduce((t, d) => t + d.water, 0) / h.days.length) * 10) / 10
  const workouts = h.days.filter((d) => d.workout && d.workout.total > 0 && d.workout.done === d.workout.total).length
  const meals = h.days.reduce((t, d) => t + d.meals, 0)
  const items: { icon: IconName; tint: string; label: string; value: string }[] = [
    { icon: 'scale', tint: 'bg-violet/10 text-violet', label: 'Weight trend', value: change === null ? 'Not enough data' : `${change > 0 ? '+' : ''}${change} kg` },
    { icon: 'drop', tint: 'bg-sky-100 text-sky-600', label: 'Average water', value: `${avgWater} glasses` },
    { icon: 'dumbbell', tint: 'bg-indigo-100 text-violet', label: 'Workouts done', value: String(workouts) },
    { icon: 'bowl', tint: 'bg-emerald-100 text-emerald-600', label: 'Meals eaten', value: String(meals) },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="card flex items-center gap-3 p-3.5">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${i.tint}`}><Icon name={i.icon} /></span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{i.label}</p>
            <p className="truncate text-base font-extrabold tabular-nums text-heading">{i.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-56 items-center justify-center rounded-xl bg-ink-2/60 px-6 text-center text-sm text-muted">{text}</div>
}

export function Progress() {
  const saved = useProgress()
  const [range, setRange] = useState<Range>(30)
  const [history, setHistory] = useState<{ range: Range; data: History } | { range: Range; error: string } | null>(null)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  // Water taps come quickly: reload the charts once, after the taps stop and the save has gone through.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(refresh, 1500)
  }, [refresh])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  useEffect(() => {
    let live = true
    fetchHistory(range).then(
      (data) => { if (live) setHistory({ range, data }) },
      (err: unknown) => { if (live) setHistory({ range, error: err instanceof ApiError ? err.message : 'Could not load your history.' }) },
    )
    return () => { live = false }
  }, [range, version])

  const h = history && 'data' in history ? history.data : null
  const charts = useMemo(() => (h ? { weight: weightChart(h), water: waterChart(h), consistency: consistencyChart(h) } : null), [h])

  if (saved.status === 'error' && /onboarding/i.test(saved.message)) return <Navigate to="/onboarding" replace />

  return (
    <AppShell>
      <PageHeader icon="chart" tint="bg-violet/10 text-violet" title="Your progress" sub={saved.status === 'ready' ? longDate(saved.data.today) : 'Weight, water and how consistent you have been.'} />

      <div className="mt-6 space-y-6">
        {saved.status === 'loading' && <div className="grid gap-4 md:grid-cols-2" role="status" aria-label="Loading">{[0, 1].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-white" />)}</div>}
        {saved.status === 'error' && <div className="card p-6 text-sm text-heading" role="alert">{saved.message}</div>}
        {saved.status === 'ready' && (
          <div className="grid gap-4 md:grid-cols-2">
            <WeightCard p={saved.data} onSaved={refresh} />
            <WaterCard p={saved.data} onSaved={refreshSoon} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-heading">Over time</h2>
          <div className="card flex gap-1 p-1" role="tablist" aria-label="Time range">
            {RANGES.map((r) => (
              <button key={r.days} type="button" role="tab" aria-selected={range === r.days} onClick={() => setRange(r.days)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${range === r.days ? 'btn-primary text-white' : 'text-muted hover:bg-ink-2 hover:text-heading'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {history && 'error' in history && <div className="card p-6 text-sm text-heading" role="alert">{history.error} <button type="button" onClick={refresh} className="font-semibold text-violet hover:underline">Try again</button></div>}
        {!history && <div className="h-80 animate-pulse rounded-2xl bg-white" role="status" aria-label="Loading charts" />}

        {h && charts && (
          <>
            <Summary h={h} />
            <Card icon="scale" tint="bg-violet/10 text-violet" title="Weight" sub="The trend line averages the last 7 days, so one heavy day does not throw you off.">
              {h.trend.length ? <Chart config={charts.weight} label={`Weight over the last ${range} days`} className="h-64" /> : <Empty text="Log your weight above. Your trend appears here after your first weigh-in." />}
            </Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card icon="drop" tint="bg-sky-100 text-sky-600" title="Water" sub="Green bars reached the goal.">
                <Chart config={charts.water} label={`Glasses of water each day over the last ${range} days`} />
              </Card>
              <Card icon="checkCircle" tint="bg-emerald-100 text-emerald-600" title="Consistency" sub="Meals eaten each day, and how much of each workout you did.">
                <Chart config={charts.consistency} label={`Meals eaten and workouts done over the last ${range} days`} />
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
