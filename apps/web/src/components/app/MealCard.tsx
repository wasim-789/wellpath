/** One planned meal: what to eat, how much, and why it was chosen. Can be swapped for another plate. */
import { useState } from 'react'
import { reasonText, mealChoice, type PlannedMeal } from '@wellpath/engine'
import { ApiError } from '../../lib/auth'
import { MEAL_LABEL, fetchAlternatives, swapMeal, undoSwap, type MealsResponse } from '../../lib/meals'
import { toast } from '../../lib/toast'

type Swap = { weekStart: string; day: number; onPlan: (data: MealsResponse) => void }

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

function Items({ meal }: { meal: PlannedMeal }) {
  return (
    <ul className="divide-y divide-line">
      {meal.items.map((i) => (
        <li key={i.slug} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="text-heading">
            <span className="font-medium">{i.name}</span>
            <span className="text-muted"> · {i.amount}</span>
          </span>
          <span className="shrink-0 tabular-nums text-muted">{i.nutrients.kcal} kcal</span>
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
    <article className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-heading">
          {label}
          {meal.swapped && <span className="ml-2 rounded-full bg-mint/15 px-2 py-0.5 align-middle text-[11px] font-semibold text-mint">Your pick</span>}
        </h3>
        <p className="text-sm font-semibold tabular-nums text-heading">
          {meal.totals.kcal} <span className="font-normal text-muted">kcal · {Math.round(meal.totals.proteinG)} g protein</span>
        </p>
      </div>

      <div className="mt-3">
        {meal.items.length === 0 ? <p className="text-sm text-muted">{reasonText(meal.reasons[0])}</p> : <Items meal={meal} />}
      </div>

      {why.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs text-muted">
          {why.map((r) => <li key={r.code} className="flex gap-2"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lilac" />{reasonText(r)}</li>)}
        </ul>
      )}

      {swap && meal.items.length > 0 && !options && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3">
          <button type="button" onClick={openChoices} disabled={busy} className="text-sm font-semibold text-violet hover:underline disabled:opacity-50">
            {busy ? 'Finding other meals…' : `Change this ${label.toLowerCase()}`}
          </button>
          {meal.swapped && (
            <button type="button" disabled={busy} onClick={() => run(() => undoSwap(swap.weekStart, swap.day, meal.slot), `${label} is back to the original plan.`)} className="text-sm font-semibold text-muted hover:underline disabled:opacity-50">
              Back to the original
            </button>
          )}
        </div>
      )}

      {swap && options && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-sm font-semibold text-heading">Pick another {label.toLowerCase()}</p>
          <p className="text-xs text-muted">Each one has about the same calories and protein, and follows your diet and health rules.</p>
          <ul className="mt-3 space-y-3">
            {options.map((o) => (
              <li key={o.items.map((i) => i.slug).join('+')} className="rounded-xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs tabular-nums text-muted">{o.totals.kcal} kcal · {Math.round(o.totals.proteinG)} g protein</p>
                  <button
                    type="button" disabled={busy}
                    onClick={() => run(() => swapMeal(swap.weekStart, swap.day, meal.slot, mealChoice(o)), `${label} changed.`)}
                    className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >Choose this</button>
                </div>
                <Items meal={o} />
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setOptions(null)} disabled={busy} className="mt-3 text-sm font-semibold text-muted hover:underline">Keep the current {label.toLowerCase()}</button>
        </div>
      )}
    </article>
  )
}
