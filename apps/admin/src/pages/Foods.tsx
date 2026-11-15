import { useMemo, useState } from 'react'
import { nutrientsForPortion } from '@wellpath/engine'
import { DEFAULT_ROLE, DIET_TYPES, FOOD_CATEGORIES, FOOD_TAGS, FOOD_TAG_LABEL, MEAL_ROLES, MEAL_SLOTS, PORTION_UNITS, foodSchema, type DietType, type Food, type MealRole, type Nutrients } from '@wellpath/shared'
import { Badge, Button, Card, Chips, Confirm, Empty, Field, Input, LoadState, Modal, PageHeader, SearchInput, Select, Toggle, td, th } from '../components/ui'
import { toast } from '../components/toast'
import { ApiError } from '../lib/auth'
import { foodsApi, humanize, issueMap, slugify, useLoad, type Stored } from '../lib/content'

const DIET_LABEL: Record<DietType, string> = { vegetarian: 'Vegetarian', eggetarian: 'Eggetarian', non_vegetarian: 'Non-veg' }
const ROLE_LABEL: Record<MealRole, string> = {
  staple: 'Staple, eaten with a curry (roti, rice)',
  main: 'Main, needs roti or rice (daal, karahi)',
  complete: 'Complete meal on its own (biryani, oats)',
  side: 'Side (raita, salad, fruit)',
  drink: 'Drink (chai, lassi)',
}
const dietTone ={ vegetarian: 'green', eggetarian: 'amber', non_vegetarian: 'red' } as const

const blank: Food = {
  slug: '', name: '', category: 'vegetables', dietCategory: 'vegetarian', mealSlots: ['lunch', 'dinner'],
  per100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  portions: [{ unit: 'katori', label: '1 katori', grams: 150 }],
  treat: false, source: { name: 'Admin entry' }, verified: false,
}

/** Kcal for one portion, or null while the form is half filled. */
function portionKcal(food: Pick<Food, 'per100g' | 'portions'>, i: number) {
  try { return nutrientsForPortion(food, i).kcal } catch { return null }
}

export function Foods() {
  const { data: foods, loading, error, reload, set } = useLoad(foodsApi.list)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [diet, setDiet] = useState('all')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState<{ food: Food; isNew: boolean } | null>(null)
  const [toDelete, setToDelete] = useState<Food | null>(null)

  const all = useMemo(() => foods ?? [], [foods])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((f) =>
      (!needle || `${f.name} ${f.nameRoman ?? ''} ${f.slug}`.toLowerCase().includes(needle)) &&
      (category === 'all' || f.category === category) &&
      (diet === 'all' || f.dietCategory === diet) &&
      (status === 'all' || (status === 'verified') === f.verified))
  }, [all, q, category, diet, status])
  const unverified = all.filter((f) => !f.verified).length

  const replace = (item: Stored<Food>) => set((list) => list.map((x) => (x.slug === item.slug ? item : x)))

  const verify = async (f: Food) => {
    try { replace(await foodsApi.verify(f.slug)); toast(`${f.name} marked verified`) } catch (err) { toast(err instanceof Error ? err.message : 'Could not verify', 'error') }
  }
  const remove = async (f: Food) => {
    try { await foodsApi.remove(f.slug); set((list) => list.filter((x) => x.slug !== f.slug)); toast('Food deleted') } catch (err) { toast(err instanceof Error ? err.message : 'Could not delete', 'error') }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Foods"
        sub={foods ? `${all.length} foods${unverified ? `, ${unverified} waiting for someone to check the values` : ', all verified'}` : 'The food library the meal planner chooses from'}
        actions={<Button variant="primary" icon="plus" onClick={() => setEditing({ food: blank, isNew: true })} disabled={!foods}>Add food</Button>}
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_repeat(3,10rem)]">
          <SearchInput value={q} onChange={setQ} placeholder="Search by name or Roman Urdu" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
            <option value="all">All categories</option>{FOOD_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
          </Select>
          <Select value={diet} onChange={(e) => setDiet(e.target.value)} aria-label="Filter by diet">
            <option value="all">All diets</option>{DIET_TYPES.map((d) => <option key={d} value={d}>{DIET_LABEL[d]}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="all">Any status</option><option value="unverified">Needs review</option><option value="verified">Verified</option>
          </Select>
        </div>
        {!foods ? <LoadState loading={loading} error={error} onRetry={reload} /> : rows.length === 0 ? <Empty title="No foods found" body="Add one or change the filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-ink-2/60"><tr><th className={th}>Food</th><th className={th}>Diet</th><th className={th}>Main portion</th><th className={th}>Per 100 g</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((f) => (
                  <tr key={f.slug} className="hover:bg-ink-2/60">
                    <td className={td}>
                      <p className="font-medium text-heading">{f.name}{f.treat && <span className="ml-2 align-middle"><Badge tone="gray">Treat</Badge></span>}</p>
                      <p className="text-xs text-muted">{f.nameRoman && <span className="italic">{f.nameRoman} · </span>}{humanize(f.category)}</p>
                    </td>
                    <td className={td}><Badge tone={dietTone[f.dietCategory]}>{DIET_LABEL[f.dietCategory]}</Badge></td>
                    <td className={`${td} text-text`}>
                      {f.portions[0].label} <span className="text-muted">({f.portions[0].grams} g)</span>
                      <p className="text-xs font-semibold tabular-nums text-heading">{portionKcal(f, 0)} kcal</p>
                    </td>
                    <td className={`${td} tabular-nums text-text`}>
                      <span className="font-semibold text-heading">{f.per100g.kcal} kcal</span>
                      <p className="text-xs text-muted">P {f.per100g.proteinG} · C {f.per100g.carbsG} · F {f.per100g.fatG} g</p>
                    </td>
                    <td className={td}>
                      {f.verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Needs review</Badge>}
                      <p className="mt-1 max-w-[12rem] truncate text-xs text-muted" title={f.source.note ?? f.source.name}>{f.source.name}</p>
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex justify-end gap-1">
                        {!f.verified && <Button variant="ghost" onClick={() => verify(f)}>Verify</Button>}
                        <Button variant="ghost" icon="edit" aria-label={`Edit ${f.name}`} onClick={() => setEditing({ food: f, isNew: false })} />
                        <Button variant="ghost" icon="trash" aria-label={`Delete ${f.name}`} onClick={() => setToDelete(f)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-muted">Starter values are estimates. Check each food against its source (or a lab-tested database) before marking it verified.</p>

      {editing && foods && (
        <FoodForm
          initial={editing.food} isNew={editing.isNew} foods={all}
          onClose={() => setEditing(null)}
          onSaved={(item) => { set((list) => (editing.isNew ? [...list, item].sort((a, b) => a.name.localeCompare(b.name)) : list.map((x) => (x.slug === item.slug ? item : x)))); setEditing(null) }}
        />
      )}
      {toDelete && <Confirm title="Delete food" body={`Delete "${toDelete.name}"? Meal plans will stop suggesting it.`} confirmLabel="Delete" danger onClose={() => setToDelete(null)} onConfirm={() => void remove(toDelete)} />}
    </div>
  )
}

/** Drops empty optional text fields, so they are left out rather than saved as "". */
function clean(f: Food): Food {
  const out: Food = { ...f, name: f.name.trim(), source: { name: f.source.name.trim(), ...(f.source.note?.trim() ? { note: f.source.note.trim() } : {}) } }
  if (!f.nameRoman?.trim()) delete out.nameRoman
  else out.nameRoman = f.nameRoman.trim()
  if (!f.variantOf) delete out.variantOf
  if (!f.role) delete out.role
  if (!f.tags?.length) delete out.tags
  return out
}

const NUTRIENTS: { key: keyof Nutrients; label: string }[] = [
  { key: 'kcal', label: 'Calories (kcal)' }, { key: 'proteinG', label: 'Protein (g)' }, { key: 'carbsG', label: 'Carbs (g)' }, { key: 'fatG', label: 'Fat (g)' }, { key: 'fiberG', label: 'Fibre (g)' },
]

function FoodForm({ initial, isNew, foods, onClose, onSaved }: { initial: Food; isNew: boolean; foods: Food[]; onClose: () => void; onSaved: (f: Stored<Food>) => void }) {
  const [f, setF] = useState<Food>(initial)
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const valuesChanged = JSON.stringify([f.per100g, f.portions]) !== JSON.stringify([initial.per100g, initial.portions])

  const update = (patch: Partial<Food>) => setF((cur) => ({ ...cur, ...patch }))
  /** Changing values on a verified food un-verifies it, so nobody trusts numbers that were not re-checked. */
  const updateValues = (patch: Partial<Food>) => setF((cur) => ({ ...cur, ...patch, verified: false }))
  const macroKcal = Math.round(f.per100g.proteinG * 4 + f.per100g.carbsG * 4 + f.per100g.fatG * 9)

  const save = async () => {
    const payload = clean(f)
    const parsed = foodSchema.safeParse(payload)
    if (!parsed.success) { setErr(issueMap(parsed.error.issues)); return }
    setErr({}); setBusy(true)
    try {
      const item = isNew ? await foodsApi.create(parsed.data) : await foodsApi.update(parsed.data)
      toast(isNew ? 'Food added' : 'Food saved')
      onSaved(item)
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErr(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, v[0]])))
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally { setBusy(false) }
  }

  const portion = (i: number, patch: Partial<Food['portions'][number]>) => updateValues({ portions: f.portions.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const errCount = Object.keys(err).length

  return (
    <Modal
      title={isNew ? 'Add food' : `Edit ${initial.name}`} width="max-w-3xl" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></>}
    >
      {errCount > 0 && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Fix the {errCount === 1 ? 'highlighted field' : `${errCount} highlighted fields`} before saving.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={err.name}>
          <Input value={f.name} placeholder="e.g. Chicken karahi" onChange={(e) => update({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
        </Field>
        <Field label="Roman Urdu name" hint="How people type it, for text logging later" error={err.nameRoman}>
          <Input value={f.nameRoman ?? ''} placeholder="e.g. murgh karahi" onChange={(e) => update({ nameRoman: e.target.value })} />
        </Field>
        <Field label="Slug" hint={isNew ? 'Lowercase words joined by hyphens' : 'Plans refer to foods by slug, so it cannot change'} error={err.slug}>
          <Input value={f.slug} disabled={!isNew} onChange={(e) => { setSlugTouched(true); update({ slug: e.target.value }) }} />
        </Field>
        <Field label="Version of" hint="Optional: links beef biryani to chicken biryani, for swaps" error={err.variantOf}>
          <Select value={f.variantOf ?? ''} onChange={(e) => update({ variantOf: e.target.value || undefined })}>
            <option value="">Not a version of another food</option>
            {foods.filter((x) => x.slug !== f.slug && !x.variantOf).map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => update({ category: e.target.value as Food['category'] })}>{FOOD_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select>
        </Field>
        <Field label="How it is eaten" hint="The meal planner builds plates from these roles">
          <Select value={f.role ?? ''} onChange={(e) => update({ role: (e.target.value || undefined) as Food['role'] })}>
            <option value="">Usual for {humanize(f.category).toLowerCase()}: {ROLE_LABEL[DEFAULT_ROLE[f.category]].toLowerCase()}</option>
            {MEAL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        <Field label="Diet" hint="Vegetarian includes dairy. Eggetarian adds eggs.">
          <Select value={f.dietCategory} onChange={(e) => update({ dietCategory: e.target.value as DietType })}>{DIET_TYPES.map((d) => <option key={d} value={d}>{DIET_LABEL[d]}</option>)}</Select>
        </Field>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-heading">Meals it suits</p>
          <div className="mt-1.5"><Chips options={MEAL_SLOTS} value={f.mealSlots} onChange={(mealSlots) => update({ mealSlots })} label={humanize} /></div>
          {err.mealSlots && <p className="mt-1 text-xs text-rose">Pick at least one meal.</p>}
        </div>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-heading">Health tags</p>
          <p className="text-xs text-muted">Safety rules use these: diabetes leaves out sugary foods and limits refined carbs, high blood pressure leaves out salty foods.</p>
          <div className="mt-1.5"><Chips tone="red" options={FOOD_TAGS} value={f.tags ?? []} onChange={(tags) => update({ tags })} label={(t) => FOOD_TAG_LABEL[t]} /></div>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 sm:col-span-2">
          <div><p className="text-sm font-medium text-heading">Treat</p><p className="text-xs text-muted">Fried or very sweet. The planner uses treats rarely.</p></div>
          <Toggle label="Treat" checked={f.treat} onChange={(treat) => update({ treat })} />
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-heading">Nutrition per 100 g</h3>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {NUTRIENTS.map((n) => (
          <Field key={n.key} label={n.label} error={err[`per100g.${n.key}`]}>
            <Input type="number" min={0} step="0.1" value={f.per100g[n.key]} onChange={(e) => updateValues({ per100g: { ...f.per100g, [n.key]: Number(e.target.value) } })} />
          </Field>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Protein, carbs and fat add up to {macroKcal} kcal (4, 4 and 9 kcal per gram).</p>

      <h3 className="mt-6 text-sm font-semibold text-heading">Portions</h3>
      <p className="text-xs text-muted">The first portion is the one plans use by default.</p>
      <div className="mt-2 space-y-2">
        {f.portions.map((p, i) => (
          <div key={i} className="grid grid-cols-[7rem_1fr_6rem_5rem_auto] items-start gap-2">
            <Select aria-label={`Portion ${i + 1} unit`} value={p.unit} onChange={(e) => portion(i, { unit: e.target.value as typeof p.unit })}>{PORTION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
            <div>
              <Input aria-label={`Portion ${i + 1} label`} value={p.label} placeholder="1 katori" onChange={(e) => portion(i, { label: e.target.value })} />
              {err[`portions.${i}.label`] && <p className="mt-1 text-xs text-rose">{err[`portions.${i}.label`]}</p>}
            </div>
            <div>
              <Input aria-label={`Portion ${i + 1} grams`} type="number" min={1} value={p.grams} onChange={(e) => portion(i, { grams: Number(e.target.value) })} />
              {err[`portions.${i}.grams`] && <p className="mt-1 text-xs text-rose">Grams must be above 0.</p>}
            </div>
            <p className="pt-2.5 text-right text-sm tabular-nums text-muted">{portionKcal(f, i) ?? '–'} kcal</p>
            <Button variant="ghost" icon="trash" aria-label={`Remove portion ${i + 1}`} disabled={f.portions.length === 1} onClick={() => updateValues({ portions: f.portions.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
      <Button className="mt-2" icon="plus" onClick={() => updateValues({ portions: [...f.portions, { unit: 'gram', label: '100 g', grams: 100 }] })}>Add portion</Button>

      <h3 className="mt-6 text-sm font-semibold text-heading">Source</h3>
      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <Field label="Where the values come from" error={err['source.name']}><Input value={f.source.name} onChange={(e) => update({ source: { ...f.source, name: e.target.value } })} /></Field>
        <Field label="Note"><Input value={f.source.note ?? ''} placeholder="e.g. USDA FoodData Central, cooked" onChange={(e) => update({ source: { ...f.source, note: e.target.value } })} /></Field>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <div>
          <p className="text-sm font-medium text-heading">Values checked</p>
          <p className="text-xs text-muted">{valuesChanged && initial.verified && !f.verified ? 'You changed the values, so this was switched off. Turn it on only after checking them again.' : 'Turn on only after checking the values against the source.'}</p>
        </div>
        <Toggle label="Values checked" checked={f.verified} onChange={(verified) => update({ verified })} />
      </div>
    </Modal>
  )
}
