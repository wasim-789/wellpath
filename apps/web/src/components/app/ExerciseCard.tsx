/**
 * One exercise, made for beginners: what it is for, the exact sets,
 * reps (or time) and rest, numbered steps, a tip, a set tracker, a timer for timed moves, and a way to swap it.
 */
import { useEffect, useRef, useState } from 'react'
import type { PlannedExercise } from '@wellpath/engine'
import { ApiError } from '../../lib/auth'
import { GUIDES } from '../../lib/exerciseGuides'
import { toast } from '../../lib/toast'
import { EQUIPMENT_LABEL, MUSCLE_LABEL, fetchExerciseAlternatives, swapExercise, undoExerciseSwap, type WorkoutsResponse } from '../../lib/workouts'
import { Icon, type IconName } from './Icon'

export type Swap = { weekStart: string; day: number; onPlan: (data: WorkoutsResponse) => void }

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)
const listText = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

function timeText(seconds: number) {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`
  if (seconds > 60) return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
  return `${seconds} s`
}

function Fact({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${tone}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-80"><Icon name={icon} className="h-3.5 w-3.5" />{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

/** Counts down one timed set. Calls onDone when it reaches zero. */
function Timer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [left, setLeftState] = useState(seconds)
  const [running, setRunning] = useState(false)
  const leftRef = useRef(seconds)
  const doneRef = useRef(onDone)
  useEffect(() => { doneRef.current = onDone }, [onDone])
  const setLeft = (s: number) => { leftRef.current = s; setLeftState(s) }

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const next = Math.max(0, leftRef.current - 1)
      leftRef.current = next
      setLeftState(next)
      if (next === 0) {
        setRunning(false)
        doneRef.current()
        toast('Time! Set done.')
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [running])

  const R = 15
  const full = 2 * Math.PI * R
  const started = left !== seconds
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-2.5">
      <svg viewBox="0 0 36 36" className="h-11 w-11 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={R} fill="none" stroke="#eef2ff" strokeWidth="4" />
        <circle cx="18" cy="18" r={R} fill="none" stroke="#4f46e5" strokeWidth="4" strokeLinecap="round" strokeDasharray={full} strokeDashoffset={full * (1 - left / seconds)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <p className="min-w-14 text-xl font-extrabold tabular-nums text-heading" role="timer" aria-live="off">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>
      <div className="ml-auto flex gap-1.5">
        <button
          type="button" onClick={() => { if (left === 0) setLeft(seconds); setRunning((r) => !r) }}
          className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
        >
          <Icon name={running ? 'pause' : 'play'} className="h-3.5 w-3.5" strokeWidth={2.4} />{running ? 'Pause' : started && left > 0 ? 'Resume' : 'Start timer'}
        </button>
        {started && !running && (
          <button type="button" onClick={() => setLeft(seconds)} className="rounded-lg border border-line px-2.5 py-2 text-xs font-semibold text-heading hover:bg-ink-2" aria-label="Reset the timer">
            <Icon name="refresh" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function SetTracker({ total, done, onChange }: { total: number; done: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Sets done">
      {Array.from({ length: total }, (_, i) => {
        const ticked = i < done
        return (
          <button
            key={i} type="button" aria-pressed={ticked}
            onClick={() => onChange(ticked && i === done - 1 ? i : i + 1)}
            className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-xs font-bold transition ${
              ticked ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-line bg-white text-heading hover:border-violet/40'}`}
          >
            <Icon name={ticked ? 'checkCircle' : 'repeat'} className="h-3.5 w-3.5" />{total === 1 ? (ticked ? 'Done' : 'Mark done') : `Set ${i + 1}`}
          </button>
        )
      })}
    </div>
  )
}

export function ExerciseCard({ e, index, swap, done, onDone }: { e: PlannedExercise; index: number; swap: Swap; done: number; onDone: (sets: number) => void }) {
  const [options, setOptions] = useState<PlannedExercise[] | null>(null)
  const [busy, setBusy] = useState(false)
  const guide = GUIDES[e.slug]
  const finished = done >= e.sets
  const muscles = e.muscleGroups.map((m) => MUSCLE_LABEL[m])
  const purpose = guide?.purpose ?? `Works your ${listText(muscles.map((m) => m.toLowerCase()))}.`
  const perSet = e.reps ? `${e.reps} reps` : e.seconds ? timeText(e.seconds) : '—'

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

  async function run(action: () => Promise<WorkoutsResponse>, message: string) {
    setBusy(true)
    try {
      swap.onPlan(await action())
      setOptions(null)
      toast(message)
    } catch (err) {
      toast(errorText(err, 'Could not change this exercise.'), 'error')
      if (err instanceof ApiError && (err.status === 409 || err.status === 404)) setOptions(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`card overflow-hidden transition ${finished ? 'ring-2 ring-emerald-300' : ''}`}>
      <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white ${finished ? 'bg-emerald-500' : 'btn-primary'}`}>
              {finished ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : index}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="flex flex-wrap items-center gap-2 text-lg font-bold text-heading">
                {e.name}
                {e.swapped && <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Your pick</span>}
              </h4>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {muscles.map((m) => <span key={m} className="rounded-full bg-ink-3 px-2.5 py-0.5 text-[11px] font-semibold text-violet">{m}</span>)}
                <span className="rounded-full bg-ink-2 px-2.5 py-0.5 text-[11px] font-semibold text-muted">{EQUIPMENT_LABEL[e.equipment]}</span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-text"><span className="font-semibold text-heading">What it's for: </span>{purpose}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Fact icon="repeat" label="Sets" value={String(e.sets)} tone="bg-violet/10 text-violet" />
            <Fact icon={e.reps ? 'list' : 'clock'} label={e.reps ? 'Reps each' : 'Time each'} value={perSet} tone="bg-amber-100 text-amber-800" />
            <Fact icon="pause" label="Rest" value={e.sets > 1 ? timeText(e.restSeconds) : 'None'} tone="bg-sky-100 text-sky-800" />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">How to do it</p>
            <ol className="mt-2 space-y-2">
              {e.steps.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm text-text">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-3 text-[11px] font-bold text-violet">{i + 1}</span>{s}
                </li>
              ))}
            </ol>
          </div>

          </div>
          <div className="space-y-4">
          {guide && (
            <p className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-sm text-amber-900">
              <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /><span><span className="font-semibold">Tip: </span>{guide.tip}</span>
            </p>
          )}

          <div className="space-y-2.5 rounded-xl bg-ink-2/70 p-3">
            <p className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
              Track your sets <span className="normal-case tracking-normal tabular-nums">{Math.min(done, e.sets)} of {e.sets} done</span>
            </p>
            {e.seconds && !finished && <Timer key={`${e.slug}-${done}`} seconds={e.seconds} onDone={() => onDone(Math.min(e.sets, done + 1))} />}
            <SetTracker total={e.sets} done={done} onChange={onDone} />
          </div>
          </div>
          </div>

          {!options && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openChoices} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border-2 border-violet/30 bg-white px-4 py-2 text-sm font-semibold text-violet transition hover:border-violet hover:bg-ink-3 disabled:opacity-50">
                <Icon name="swap" className="h-4 w-4" /> {busy ? 'Finding others…' : 'Change this exercise'}
              </button>
              {e.swapped && (
                <button type="button" disabled={busy} onClick={() => run(() => undoExerciseSwap(swap.weekStart, swap.day, e.slug), `${e.original?.name ?? 'The planned exercise'} is back.`)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-ink-2 hover:text-heading disabled:opacity-50">
                  <Icon name="refresh" className="h-4 w-4" /> Back to {e.original?.name.toLowerCase() ?? 'the original'}
                </button>
              )}
            </div>
          )}

          {options && (
            <div className="rounded-2xl border-2 border-violet/20 bg-ink-3/40 p-4">
              <p className="flex items-center gap-2 font-bold text-heading"><Icon name="swap" className="h-4 w-4 text-violet" />Pick another exercise</p>
              <p className="mt-0.5 text-xs text-muted">Each is safe for you, works similar muscles and takes about the same time.</p>
              <ul className="mt-3 space-y-2">
                {options.map((o) => (
                  <li key={o.slug} className="flex items-center gap-3 rounded-xl border border-line bg-white p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-heading">{o.name}</p>
                      <p className="text-xs text-muted">{o.amount}</p>
                    </div>
                    <button
                      type="button" disabled={busy}
                      onClick={() => run(() => swapExercise(swap.weekStart, swap.day, e.slug, o.slug), `${e.name} changed to ${o.name.toLowerCase()}.`)}
                      className="btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    ><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />Choose</button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setOptions(null)} disabled={busy} className="mt-3 text-sm font-semibold text-muted hover:text-heading">Keep {e.name.toLowerCase()}</button>
            </div>
          )}
      </div>
    </article>
  )
}
