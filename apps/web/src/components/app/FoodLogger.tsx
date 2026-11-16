/**
 * "Log what you ate": type it the way you say it ("2 roti aur ek katori daal"), check what WellPath understood,
 * fix anything, and save it to a meal. Below it, the foods already typed in for that day, each removable.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { foodItem, type LogFood } from '@wellpath/engine'
import { MEAL_SLOTS, type MealSlot } from '@wellpath/shared'
import { ApiError } from '../../lib/auth'
import { MEAL_LABEL, SLOT_STYLE } from '../../lib/meals'
import { addWater, foodLibrary, logFoods, readFood, removeFood, type DayProgress } from '../../lib/progress'
import { toast } from '../../lib/toast'
import { Icon } from './Icon'

type Row = { key: number; slug: string; portionIndex: number; quantity: number; close?: boolean; note?: string }

const EXAMPLES = ['2 roti aur ek katori daal', 'nashta: 2 anday, 1 paratha, chai', '1 plate biryani aur raita', '10 badam aur 1 seb']

/** The meal most likely being logged now, from the time of day. */
function slotNow(hour = new Date().getHours()): MealSlot {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 19) return 'snack'
  return 'dinner'
}

const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)
let nextKey = 1

function RowEditor({ row, foods, onChange, onRemove }: { row: Row; foods: LogFood[]; onChange: (r: Row) => void; onRemove: () => void }) {
  const food = foods.find((f) => f.slug === row.slug)
  const item = food && row.quantity > 0 ? foodItem(food, row.portionIndex, row.quantity) : null
  return (
    <li className={`rounded-xl border bg-white p-3 ${row.close ? 'border-amber-300' : 'border-line'}`}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,10rem)_auto] sm:items-center">
        <label className="sr-only" htmlFor={`food-${row.key}`}>Food</label>
        <select
          id={`food-${row.key}`} value={row.slug} onChange={(e) => onChange({ ...row, slug: e.target.value, portionIndex: 0, close: false, note: undefined })}
          className="min-w-0 rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-heading focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/15"
        >
          {!food && <option value="">Pick a food…</option>}
          {foods.map((f) => <option key={f.slug} value={f.slug}>{f.name}{f.nameRoman && f.nameRoman.toLowerCase() !== f.name.toLowerCase() ? ` (${f.nameRoman})` : ''}</option>)}
        </select>
        <label className="sr-only" htmlFor={`qty-${row.key}`}>How many</label>
        <input
          id={`qty-${row.key}`} type="number" inputMode="decimal" min={0.25} max={20} step={0.25} value={row.quantity}
          onChange={(e) => onChange({ ...row, quantity: Number(e.target.value) })}
          className="rounded-lg border border-line px-2.5 py-2 text-sm tabular-nums text-heading focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/15"
        />
        <label className="sr-only" htmlFor={`portion-${row.key}`}>Portion</label>
        <select
          id={`portion-${row.key}`} value={row.portionIndex} disabled={!food} onChange={(e) => onChange({ ...row, portionIndex: Number(e.target.value), note: undefined })}
          className="min-w-0 rounded-lg border border-line bg-white px-2.5 py-2 text-sm text-heading focus:border-violet focus:outline-none focus:ring-2 focus:ring-violet/15 disabled:opacity-50"
        >
          {food?.portions.map((p, i) => <option key={p.label} value={i}>{p.label} ({p.grams} g)</option>)}
        </select>
        <button type="button" onClick={onRemove} className="justify-self-end rounded-lg p-2 text-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Remove this food">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {item ? <><span className="font-semibold text-heading">{item.amount}</span> · {item.grams} g · <span className="font-semibold tabular-nums text-heading">{item.nutrients.kcal} kcal</span> · {item.nutrients.proteinG} g protein</> : 'Pick a food and an amount.'}
        {row.close && <span className="ml-1 text-amber-700"> · Check this is the right food.</span>}
      </p>
      {row.note && <p className="mt-1 text-xs text-amber-700">{row.note}</p>}
    </li>
  )
}

/** The foods already typed in for the day, by meal, each removable. */
export function LoggedFoods({ day, progress }: { day: number; progress: DayProgress }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!progress.foods.length) return null
  async function remove(id: string, name: string) {
    setBusy(id)
    try { await removeFood(day, id); toast(`${name} removed.`) } catch (err) { toast(message(err, 'Could not remove it.'), 'error') } finally { setBusy(null) }
  }
  return (
    <div className="space-y-3">
      {MEAL_SLOTS.map((slot) => {
        const foods = progress.foods.filter((f) => f.slot === slot)
        if (!foods.length) return null
        const st = SLOT_STYLE[slot]
        return (
          <div key={slot}>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
              <span className={`flex h-5 w-5 items-center justify-center rounded ${st.tint}`}><Icon name={st.icon} className="h-3 w-3" /></span>
              {MEAL_LABEL[slot]} <span className="normal-case tracking-normal">· {foods.reduce((t, f) => t + f.nutrients.kcal, 0)} kcal</span>
            </p>
            <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line bg-white">
              {foods.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1"><span className="font-medium text-heading">{f.name}</span><span className="text-muted"> · {f.amount}</span></span>
                  <span className="shrink-0 tabular-nums text-muted">{f.nutrients.kcal} kcal</span>
                  <button type="button" onClick={() => void remove(f.id, f.name)} disabled={busy === f.id} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40" aria-label={`Remove ${f.name}`}>
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function FoodLogger({ day, locked = false }: { day: number; locked?: boolean }) {
  const [text, setText] = useState('')
  const [foods, setFoods] = useState<LogFood[] | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [unknown, setUnknown] = useState<string[]>([])
  const [water, setWater] = useState(0)
  const [slot, setSlot] = useState<MealSlot>(() => slotNow())
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null)

  useEffect(() => {
    let live = true
    foodLibrary().then((f) => { if (live) setFoods(f) }, () => { /* the picker shows once it loads; reading still works */ })
    return () => { live = false }
  }, [])

  const total = useMemo(() => {
    if (!rows || !foods) return 0
    return rows.reduce((t, r) => {
      const f = foods.find((x) => x.slug === r.slug)
      return f && r.quantity > 0 ? t + foodItem(f, r.portionIndex, r.quantity).nutrients.kcal : t
    }, 0)
  }, [rows, foods])

  async function read(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy('reading')
    try {
      const r = await readFood(text)
      setRows(r.items.map((i) => ({ key: nextKey++, slug: i.slug, portionIndex: i.portionIndex, quantity: i.quantity, close: i.match === 'close', note: i.note })))
      setUnknown(r.unknown)
      setWater(r.water ?? 0)
      if (r.slot) setSlot(r.slot)
      if (!r.items.length && !r.water) toast('No foods found in that. Try names like roti, daal, chawal or chai, or add a food by hand.', 'error')
    } catch (err) {
      toast(message(err, 'Could not read that.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  function reset() { setText(''); setRows(null); setUnknown([]); setWater(0) }

  async function save() {
    if (!rows) return
    const ready = rows.filter((r) => r.slug && r.quantity > 0)
    if (ready.length !== rows.length) { toast('Pick a food and an amount for every row, or remove it.', 'error'); return }
    setBusy('saving')
    try {
      if (ready.length) await logFoods(day, slot, ready.map(({ slug, portionIndex, quantity }) => ({ slug, portionIndex, quantity })))
      if (water > 0) addWater(day, water)
      toast(ready.length ? `Saved to ${MEAL_LABEL[slot].toLowerCase()}.` : `Added ${water} ${water === 1 ? 'glass' : 'glasses'} of water.`)
      reset()
    } catch (err) {
      toast(message(err, 'Could not save that.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  if (locked) return <p className="flex items-center gap-2 rounded-xl bg-ink-2 px-3 py-2.5 text-sm text-muted"><Icon name="clock" className="h-4 w-4" />You can log food on the day.</p>

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void read(e)} className="space-y-2">
        <label htmlFor={`food-text-${day}`} className="sr-only">What did you eat?</label>
        <div className="flex gap-2">
          <input
            id={`food-text-${day}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoComplete="off"
            placeholder="e.g. 2 roti aur ek katori daal"
            className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-heading outline-none transition focus:border-violet focus:ring-4 focus:ring-violet/10"
          />
          <button type="submit" disabled={busy !== null || !text.trim()} className="btn-primary inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            <Icon name="sparkle" className="h-4 w-4" />{busy === 'reading' ? 'Reading…' : 'Read'}
          </button>
        </div>
        {!rows && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-xs text-muted">Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full bg-ink-2 px-2.5 py-0.5 text-xs text-text hover:bg-ink-3 hover:text-violet">{ex}</button>
            ))}
          </div>
        )}
      </form>

      {rows && (
        <div className="rounded-2xl border-2 border-violet/20 bg-ink-3/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-heading">Is this right?</p>
            <p className="text-sm tabular-nums text-muted">Total <span className="font-bold text-heading">{total} kcal</span></p>
          </div>
          {!foods && <p className="mt-2 text-xs text-muted">Loading the food list…</p>}
          {foods && (
            <ul className="mt-3 space-y-2">
              {rows.map((r) => (
                <RowEditor key={r.key} row={r} foods={foods} onChange={(next) => setRows(rows.map((x) => (x.key === r.key ? next : x)))} onRemove={() => setRows(rows.filter((x) => x.key !== r.key))} />
              ))}
            </ul>
          )}
          {unknown.length > 0 && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold">Not found:</span> {unknown.join(', ')}. Add it below if it is close to a food in the list.
            </p>
          )}
          {water > 0 && (
            <label className="mt-3 flex items-center gap-2 text-sm text-heading">
              <input type="checkbox" checked={water > 0} onChange={() => setWater(0)} className="h-4 w-4 accent-sky-500" />
              Also add {water} {water === 1 ? 'glass' : 'glasses'} of water
            </label>
          )}
          <button type="button" onClick={() => setRows([...rows, { key: nextKey++, slug: '', portionIndex: 0, quantity: 1 }])} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-violet hover:underline">
            <Icon name="plus" className="h-4 w-4" />Add a food
          </button>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <label htmlFor={`slot-${day}`} className="text-sm text-muted">Save to</label>
            <select id={`slot-${day}`} value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)} className="rounded-lg border border-line bg-white px-2.5 py-2 text-sm font-semibold text-heading">
              {MEAL_SLOTS.map((s) => <option key={s} value={s}>{MEAL_LABEL[s]}</option>)}
            </select>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={reset} disabled={busy !== null} className="rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-heading hover:bg-ink-2">Cancel</button>
              <button type="button" onClick={() => void save()} disabled={busy !== null || (!rows.length && !water)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-600 disabled:opacity-50">
                <Icon name="check" className="h-4 w-4" strokeWidth={2.6} />{busy === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
