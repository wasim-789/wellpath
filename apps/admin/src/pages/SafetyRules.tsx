import { Link } from 'react-router'
import { LOAD_LABEL } from '@wellpath/shared'
import { Badge, Button, Card, LoadState, PageHeader } from '../components/ui'
import { Icon } from '../components/icons'
import { humanize, safetyApi, useLoad } from '../lib/content'
import { CONDITION_LABEL } from '../lib/types'

/** The planner needs at least this many safe beginner exercises of each type to build a varied week. */
const MINIMUM = { strength: 4, cardio: 2, mobility: 2 } as const

export function SafetyRules() {
  const { data, loading, error, reload } = useLoad(safetyApi.list)

  return (
    <div className="fade-in">
      <PageHeader
        title="Safety rules"
        sub="Exercises left out for people who report an injury or condition. The AI coach cannot override these."
        actions={<Button icon="refresh" onClick={reload} disabled={loading}>Refresh</Button>}
      />
      <Card className="mb-4 flex items-start gap-3 p-4">
        <span className="mt-0.5 text-violet"><Icon name="shield" /></span>
        <p className="text-sm text-text">
          These rules are part of the plan engine and are covered by automated tests, so they cannot be switched off here.
          To change who an exercise is hidden from, edit its safety tags on the <Link to="/exercises" className="font-semibold text-violet hover:underline">Exercises</Link> page.
        </p>
      </Card>
      {!data ? <Card><LoadState loading={loading} error={error} onRetry={reload} /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.rules.map((r) => {
            const short = (Object.keys(MINIMUM) as (keyof typeof MINIMUM)[]).filter((t) => r.beginnerLeft[t] < MINIMUM[t])
            return (
              <Card key={r.condition} className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-3 text-violet"><Icon name="shield" /></span>
                  <div>
                    <h2 className="font-semibold text-heading">{CONDITION_LABEL[r.condition]}</h2>
                    <p className="text-xs text-muted">{r.usersAffected === 1 ? '1 user has' : `${r.usersAffected} users have`} this on their profile</p>
                  </div>
                </div>

                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Leaves out exercises that involve</p>
                {r.blockedLoads.length
                  ? <ul className="mt-1 list-inside list-disc text-sm text-text">{r.blockedLoads.map((l) => <li key={l}>{LOAD_LABEL[l]}</li>)}</ul>
                  : <p className="mt-1 text-sm text-text">Nothing. Workouts stay the same and the user sees the notice below.</p>}

                {r.blockedExercises.length > 0 && <>
                  <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Left out now ({r.blockedExercises.length} of {data.exerciseCount})</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{r.blockedExercises.map((e) => <Badge key={e.slug} tone="red">{e.name}</Badge>)}</div>
                </>}

                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Safe beginner exercises left</p>
                <p className="mt-1 text-sm text-text">{(Object.keys(MINIMUM) as (keyof typeof MINIMUM)[]).map((t) => `${r.beginnerLeft[t]} ${humanize(t).toLowerCase()}`).join(' · ')}</p>
                {short.length > 0 && (
                  <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                    Too few safe {short.join(' and ')} exercises for beginners (the planner needs {short.map((t) => `${MINIMUM[t]} ${t}`).join(', ')}). Add gentler exercises.
                  </p>
                )}

                <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Notice shown to the user</p>
                <p className="mt-1 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{r.notice}</p>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
