/** One planned meal: what to eat, how much, and why it was chosen. Can be swapped for another plate. */
import { useState } from 'react'
import { reasonText, mealChoice, type PlannedMeal } from '@wellpath/engine'
import { ApiError } from '../../lib/auth'
import { MEAL_LABEL, SLOT_STYLE, fetchAlternatives, swapMeal, undoSwap, type MealsResponse } from '../../lib/meals'
import { toast } from '../../lib/toast'
import { Icon } from './Icon'

type Swap = { weekStart: string; day: number; onPlan: (data: MealsResponse) => void }


const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

function Macros({ meal }: { meal: PlannedMeal }) {
  const items = [
    { k: 'Protein', v: meal.totals.proteinG, dot: 'bg-lilac' },
    { k: 'Carbs', v: meal.totals.carbsG, dot: 'bg-sky-500' },
    { k: 'Fat', v: meal.totals.fatG, dot: 'bg-amber' },
  ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((m) => (
        <span key={m.k} className="inline-flex items-center gap-1.5 rounded-full bg-ink-2 px-2.5 py-1 text-xs text-text">
          <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.k} <span className="font-semibold tabular-nums text-heading">{Math.round(m.v)} g</span>
        </span>
      ))}
    </div>
  )
}

function Items({ meal }: { meal: PlannedMeal }) {
  return (
    <ul className="space-y-2">
      {meal.items.map((i) => (
        <li key={i.slug} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-violet/60" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-heading">{i.name}</p>
            <p className="text-xs text-muted">{i.amount} <span className="text-line">·</span> {i.grams} g</p>
          </div>
          <span className="shrink-0 rounded-lg bg-ink-2 px-2 py-1 text-xs font-semibold tabular-nums text-heading">{i.nutrients.kcal} kcal</span>
        </li>
      ))}
    </ul>
  )
}

export function MealCard({ meal, swap }: { meal: PlannedMeal; swap?: Swap }) {
  const [options, setOptions] = useState<PlannedMeal[] | null>(null)
  const [busy, setBusy] = useState(false)
  // The calorie line is already shown in the header, so only the extra reasons are listed.
  const why = meal.reasons.filter((r) => r.code !== 'meal_calories')
  const label = MEAL_LABEL[meal.slot]
  const style = SLOT_STYLE[meal.slot]

  async function openChoices() {
    if (!swap) return
    setBusy(true)
    try {
      const found = await fetchAlternatives(swap.weekStart, swap.day, meal.slot)
      if (found.length) setOptions(found)
      else toast(`No other ${label.toLowerCase()} fits your plan right now.`, 'error')
    } catch (err) {
      toast(errorText(err, 'Could not load other meals.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<MealsResponse>, done: string) {
    if (!swap) return
    setBusy(true)
    try {
      swap.onPlan(await action())
      setOptions(null)
      toast(done)
    } catch (err) {
      toast(errorText(err, 'Could not change this meal.'), 'error')
      if (err instanceof ApiError && err.status === 409) setOptions(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="card flex flex-col overflow-hidden">
      <div className={`flex items-center justify-between gap-3 bg-gradient-to-r ${style.band} to-white px-5 py-4`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${style.tint}`}><Icon name={style.icon} /></span>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{style.when}</p>
            <h3 className="flex items-center gap-2 text-lg font-bold text-heading">
              {label}
              {meal.swapped && <span className="rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Your pick</span>}
            </h3>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold tabular-nums text-heading">{meal.totals.kcal}</p>
          <p className="text-[11px] font-semibold uppercase text-muted">kcal</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5 pt-4">
        {meal.items.length === 0
          ? <p className="rounded-xl bg-ink-2 p-3 text-sm text-muted">{reasonText(meal.reasons[0])}</p>
          : (<><Macros meal={meal} /><Items meal={meal} /></>)}

        {why.length > 0 && (
          <ul className="space-y-1.5 rounded-xl bg-ink-3/60 p-3 text-xs text-text">
            {why.map((r) => <li key={r.code} className="flex gap-2"><Icon name="sparkle" className="mt-px h-3.5 w-3.5 shrink-0 text-violet" />{reasonText(r)}</li>)}
          </ul>
        )}

        {swap && meal.items.length > 0 && !options && (
          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <button type="button" onClick={openChoices} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border-2 border-violet/30 bg-white px-4 py-2 text-sm font-semibold text-violet transition hover:border-violet hover:bg-ink-3 disabled:opacity-50">
              <Icon name="swap" className="h-4 w-4" /> {busy ? 'Finding other meals…' : `Change this ${label.toLowerCase()}`}
            </button>
            {meal.swapped && (
              <button type="button" disabled={busy} onClick={() => run(() => undoSwap(swap.weekStart, swap.day, meal.slot), `${label} is back to the original plan.`)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted hover:bg-ink-2 hover:text-heading disabled:opacity-50">
                <Icon name="refresh" className="h-4 w-4" /> Back to the original
              </button>
            )}
          </div>
        )}

        {swap && options && (
          <div className="rounded-2xl border-2 border-violet/20 bg-ink-3/40 p-4">
            <p className="flex items-center gap-2 font-bold text-heading"><Icon name="swap" className="h-4 w-4 text-violet" />Pick another {label.toLowerCase()}</p>
            <p className="mt-0.5 text-xs text-muted">Each has about the same calories and protein, and follows your diet and health rules.</p>
            <ul className="mt-3 space-y-3">
              {options.map((o) => (
                <li key={o.items.map((i) => i.slug).join('+')} className="rounded-xl border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold tabular-nums text-heading">{o.totals.kcal} kcal <span className="font-normal text-muted">· {Math.round(o.totals.proteinG)} g protein</span></p>
                    <button
                      type="button" disabled={busy}
                      onClick={() => run(() => swapMeal(swap.weekStart, swap.day, meal.slot, mealChoice(o)), `${label} changed.`)}
                      className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    ><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />Choose this</button>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {o.items.map((i) => <li key={i.slug} className="flex justify-between gap-3"><span className="text-heading">{i.name} <span className="text-muted">· {i.amount}</span></span><span className="shrink-0 tabular-nums text-muted">{i.nutrients.kcal}</span></li>)}
                  </ul>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setOptions(null)} disabled={busy} className="mt-3 text-sm font-semibold text-muted hover:text-heading">Keep the current {label.toLowerCase()}</button>
          </div>
        )}
      </div>
    </article>
  )
}
