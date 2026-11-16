/** Title block for the signed-in pages: a coloured icon, the title, a short line under it and a back link. */
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from './Icon'

export function PageHeader({ icon, tint, title, sub, back }: { icon: IconName; tint: string; title: string; sub?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header>
      {back && (
        <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-violet">
          <Icon name="arrowRight" className="h-4 w-4 rotate-180" /> {back.label}
        </Link>
      )}
      <div className={`flex items-center gap-4 ${back ? 'mt-3' : ''}`}>
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ${tint}`}><Icon name={icon} className="h-6 w-6" /></span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-muted sm:text-base">{sub}</p>}
        </div>
      </div>
    </header>
  )
}

/** A small number tile used at the top of the Meals and Workouts pages. */
export function MiniStat({ icon, tint, label, value }: { icon: IconName; tint: string; label: string; value: ReactNode }) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon name={icon} className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
        <p className="truncate text-base font-extrabold text-heading">{value}</p>
      </div>
    </div>
  )
}
