import { useMemo, useState } from 'react'
import { isExerciseSafe } from '@wellpath/engine'
import { CONDITIONS, EQUIPMENT, EXERCISE_LEVELS, EXERCISE_LOADS, EXERCISE_TYPES, LOAD_LABEL, MUSCLE_GROUPS, exerciseSchema, type Exercise, type ExerciseLoad } from '@wellpath/shared'
import { Badge, Button, Card, Chips, Confirm, Empty, Field, Input, LoadState, Modal, PageHeader, SearchInput, Select, td, th } from '../components/ui'
import { toast } from '../components/toast'
import { ApiError } from '../lib/auth'
import { exercisesApi, humanize, issueMap, slugify, useLoad, type Stored } from '../lib/content'
import { CONDITION_LABEL } from '../lib/types'

const levelTone = { beginner: 'green', intermediate: 'indigo', advanced: 'amber' } as const

/** Conditions whose safety rules leave this exercise out. */
const blockedFor = (loads: readonly ExerciseLoad[]) => CONDITIONS.filter((c) => !isExerciseSafe({ loads }, [c]))

const amount = (e: Exercise) => `${e.sets} × ${e.reps !== undefined ? `${e.reps} reps` : `${e.seconds} s`}`

const blank: Exercise = { slug: '', name: '', type: 'strength', level: 'beginner', equipment: 'none', muscleGroups: ['legs'], loads: [], sets: 3, reps: 10, met: 3.5, steps: ['', ''] }

export function Exercises() {
  const { data: items, loading, error, reload, set } = useLoad(exercisesApi.list)
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [level, setLevel] = useState('all')
  const [editing, setEditing] = useState<{ ex: Exercise; isNew: boolean } | null>(null)
  const [toDelete, setToDelete] = useState<Exercise | null>(null)

  const all = useMemo(() => items ?? [], [items])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all.filter((e) => (!needle || e.name.toLowerCase().includes(needle)) && (type === 'all' || e.type === type) && (level === 'all' || e.level === level))
  }, [all, q, type, level])

  const remove = async (e: Exercise) => {
    try { await exercisesApi.remove(e.slug); set((list) => list.filter((x) => x.slug !== e.slug)); toast('Exercise deleted') } catch (err) { toast(err instanceof Error ? err.message : 'Could not delete', 'error') }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Exercises" sub={items ? `${all.length} home exercises the workout planner can use` : 'The home workout library'}
        actions={<Button variant="primary" icon="plus" disabled={!items} onClick={() => setEditing({ ex: blank, isNew: true })}>Add exercise</Button>}
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 md:grid-cols-[1fr_repeat(2,11rem)]">
          <SearchInput value={q} onChange={setQ} placeholder="Search exercises" />
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type"><option value="all">All types</option>{EXERCISE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select>
          <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Filter by level"><option value="all">All levels</option>{EXERCISE_LEVELS.map((l) => <option key={l} value={l}>{humanize(l)}</option>)}</Select>
        </div>
        {!items ? <LoadState loading={loading} error={error} onRetry={reload} /> : rows.length === 0 ? <Empty title="No exercises found" body="Add one or change the filters." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-ink-2/60"><tr><th className={th}>Exercise</th><th className={th}>Level</th><th className={th}>Equipment</th><th className={th}>Amount</th><th className={th}>Left out for</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => {
                  const blocked = blockedFor(e.loads)
                  return (
                    <tr key={e.slug} className="hover:bg-ink-2/60">
                      <td className={td}><p className="font-medium text-heading">{e.name}</p><p className="text-xs text-muted">{humanize(e.type)} · {e.muscleGroups.map(humanize).join(', ')}</p></td>
                      <td className={td}><Badge tone={levelTone[e.level]}>{humanize(e.level)}</Badge></td>
                      <td className={`${td} text-text`}>{humanize(e.equipment)}</td>
                      <td className={`${td} tabular-nums text-text`}>{amount(e)}</td>
                      <td className={td}>{blocked.length ? <div className="flex max-w-[16rem] flex-wrap gap-1">{blocked.map((c) => <Badge key={c} tone="amber">{CONDITION_LABEL[c]}</Badge>)}</div> : <span className="text-sm text-muted">Nobody</span>}</td>
                      <td className={`${td} text-right`}><div className="flex justify-end gap-1"><Button variant="ghost" icon="edit" aria-label={`Edit ${e.name}`} onClick={() => setEditing({ ex: e, isNew: false })} /><Button variant="ghost" icon="trash" aria-label={`Delete ${e.name}`} onClick={() => setToDelete(e)} /></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <ExerciseForm
          initial={editing.ex} isNew={editing.isNew} onClose={() => setEditing(null)}
          onSaved={(item: Stored<Exercise>) => { set((list) => (editing.isNew ? [...list, item].sort((a, b) => a.name.localeCompare(b.name)) : list.map((x) => (x.slug === item.slug ? item : x)))); setEditing(null) }}
        />
      )}
      {toDelete && <Confirm title="Delete exercise" body={`Delete "${toDelete.name}"? Workout plans will stop suggesting it.`} confirmLabel="Delete" danger onClose={() => setToDelete(null)} onConfirm={() => void remove(toDelete)} />}
    </div>
  )
}

function ExerciseForm({ initial, isNew, onClose, onSaved }: { initial: Exercise; isNew: boolean; onClose: () => void; onSaved: (e: Stored<Exercise>) => void }) {
  const [f, setF] = useState<Exercise>(initial)
  const [stepsText, setStepsText] = useState(initial.steps.filter(Boolean).join('\n'))
  const [err, setErr] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const mode = f.seconds !== undefined ? 'seconds' : 'reps'
  const update = (patch: Partial<Exercise>) => setF((cur) => ({ ...cur, ...patch }))

  const removedLoads = initial.loads.filter((l) => !f.loads.includes(l))
  const newlyAllowed = blockedFor(initial.loads).filter((c) => !blockedFor(f.loads).includes(c))

  const save = async () => {
    const payload: Exercise = { ...f, name: f.name.trim(), steps: stepsText.split('\n').map((s) => s.trim()).filter(Boolean) }
    const parsed = exerciseSchema.safeParse(payload)
    if (!parsed.success) { setErr(issueMap(parsed.error.issues)); return }
    setErr({}); setBusy(true)
    try {
      const item = isNew ? await exercisesApi.create(parsed.data) : await exercisesApi.update(parsed.data)
      toast(isNew ? 'Exercise added' : 'Exercise saved')
      onSaved(item)
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErr(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k, v[0]])))
      toast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally { setBusy(false) }
  }

  const errCount = Object.keys(err).length
  const blockedNow = blockedFor(f.loads)

  return (
    <Modal
      title={isNew ? 'Add exercise' : `Edit ${initial.name}`} width="max-w-3xl" onClose={onClose}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></>}
    >
      {errCount > 0 && <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">Fix the {errCount === 1 ? 'highlighted field' : `${errCount} highlighted fields`} before saving.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={err.name}><Input value={f.name} placeholder="e.g. Glute bridge" onChange={(e) => update({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} /></Field>
        <Field label="Slug" hint={isNew ? 'Lowercase words joined by hyphens' : 'Plans refer to exercises by slug, so it cannot change'} error={err.slug}>
          <Input value={f.slug} disabled={!isNew} onChange={(e) => { setSlugTouched(true); update({ slug: e.target.value }) }} />
        </Field>
        <Field label="Type"><Select value={f.type} onChange={(e) => update({ type: e.target.value as Exercise['type'] })}>{EXERCISE_TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
        <Field label="Level"><Select value={f.level} onChange={(e) => update({ level: e.target.value as Exercise['level'] })}>{EXERCISE_LEVELS.map((l) => <option key={l} value={l}>{humanize(l)}</option>)}</Select></Field>
        <Field label="Equipment"><Select value={f.equipment} onChange={(e) => update({ equipment: e.target.value as Exercise['equipment'] })}>{EQUIPMENT.map((q) => <option key={q} value={q}>{humanize(q)}</option>)}</Select></Field>
        <Field label="MET" hint="Effort level for calorie estimates: walking is about 3.5" error={err.met}><Input type="number" min={1} max={15} step="0.1" value={f.met} onChange={(e) => update({ met: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-2">
          <p className="text-sm font-medium text-heading">Muscles worked</p>
          <div className="mt-1.5"><Chips options={MUSCLE_GROUPS} value={f.muscleGroups} onChange={(muscleGroups) => update({ muscleGroups })} label={humanize} /></div>
          {err.muscleGroups && <p className="mt-1 text-xs text-rose">Pick at least one.</p>}
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-heading">Amount per set</h3>
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <Field label="Sets" error={err.sets}><Input type="number" min={1} max={6} value={f.sets} onChange={(e) => update({ sets: Number(e.target.value) })} /></Field>
        <Field label="Measured in">
          <Select value={mode} onChange={(e) => update(e.target.value === 'seconds' ? { seconds: f.reps ?? 30, reps: undefined } : { reps: f.seconds ? 10 : (f.reps ?? 10), seconds: undefined })}>
            <option value="reps">Repetitions</option><option value="seconds">Seconds</option>
          </Select>
        </Field>
        {mode === 'reps'
          ? <Field label="Reps" error={err.reps}><Input type="number" min={1} max={50} value={f.reps ?? ''} onChange={(e) => update({ reps: Number(e.target.value) })} /></Field>
          : <Field label="Seconds" error={err.seconds}><Input type="number" min={5} max={1800} value={f.seconds ?? ''} onChange={(e) => update({ seconds: Number(e.target.value) })} /></Field>}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-heading">Safety tags</h3>
      <p className="text-xs text-muted">Tag everything this exercise puts stress on. When unsure, tag it: the safety rules hide tagged exercises from people with matching conditions.</p>
      <div className="mt-2"><Chips tone="red" options={EXERCISE_LOADS} value={f.loads} onChange={(loads) => update({ loads })} label={(l) => humanize(LOAD_LABEL[l])} /></div>
      <p className="mt-3 text-sm text-text">
        Left out for: {blockedNow.length ? blockedNow.map((c) => CONDITION_LABEL[c]).join(', ') : <span className="text-muted">nobody</span>}
      </p>
      {removedLoads.length > 0 && newlyAllowed.length > 0 && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
          You removed {removedLoads.map((l) => LOAD_LABEL[l]).join(' and ')}. People with {newlyAllowed.map((c) => CONDITION_LABEL[c].toLowerCase()).join(' or ')} will now be shown this exercise. The change is recorded in the audit log.
        </p>
      )}

      <h3 className="mt-6 text-sm font-semibold text-heading">How to do it</h3>
      <Field label="Steps, one per line (2 to 5)" error={err.steps ?? Object.entries(err).find(([k]) => k.startsWith('steps.'))?.[1]}>
        <textarea
          value={stepsText} onChange={(e) => setStepsText(e.target.value)} rows={5}
          className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-heading outline-none transition focus:border-violet focus:ring-4 focus:ring-violet/10"
        />
      </Field>
    </Modal>
  )
}
