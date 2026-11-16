/**
 * Frame for signed-in pages: a sidebar on large screens, and a slim top bar with a tab bar
 * at the bottom on phones, so every section is one tap away on any screen size.
 */
import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { LogoMark } from '../landing/ui'
import { logout, useAuth } from '../../lib/auth'
import { Icon, type IconName } from './Icon'

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/app', label: 'Dashboard', icon: 'home', end: true },
  { to: '/week', label: 'My week', icon: 'calendar' },
  { to: '/meals', label: 'Meals', icon: 'bowl' },
  { to: '/workouts', label: 'Workouts', icon: 'dumbbell' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

export function AppShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  const auth = useAuth()
  const user = auth.status === 'signed-in' ? auth.user : null

  // After logout the protected page sends you home, where the "logged out" message shows.
  const signOut = () => void logout()

  return (
    <div className="min-h-screen bg-ink-2">
      {/* Sidebar, large screens */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <Link to="/app" className="flex h-16 items-center gap-2.5 px-6" aria-label="WellPath dashboard"><LogoMark /></Link>
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                isActive ? 'bg-ink-3 text-violet' : 'text-text hover:bg-ink-2 hover:text-heading'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${isActive ? 'btn-primary text-white' : 'bg-ink-2 text-muted group-hover:text-violet'}`}>
                    <Icon name={n.icon} className="h-[18px] w-[18px]" />
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-2xl border border-line bg-ink-2/60 p-3">
          <div className="flex items-center gap-3">
            <span className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white">{initials(user?.name ?? '')}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-heading">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
          </div>
          <button type="button" onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold text-heading transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700">
            <Icon name="logout" className="h-4 w-4" /> Log out
          </button>
        </div>
      </aside>

      {/* Top bar, phones and tablets */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/app" className="flex items-center gap-2.5" aria-label="WellPath dashboard"><LogoMark /></Link>
          <div className="flex items-center gap-2">
            <span className="btn-primary flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" title={user?.email}>{initials(user?.name ?? '')}</span>
            <button type="button" onClick={signOut} className="flex h-9 w-9 items-center justify-center rounded-xl border border-line text-heading hover:bg-ink-2" aria-label="Log out">
              <Icon name="logout" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="lg:pl-64">
        <main className={`mx-auto px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-10 lg:pt-10 ${narrow ? 'max-w-2xl' : 'max-w-6xl'}`}>{children}</main>
        <p className="hidden pb-8 text-center text-xs text-muted lg:block">Wellness guidance only. Not medical advice.</p>
      </div>

      {/* Tab bar, phones and tablets */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-violet' : 'text-muted'}`}>
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${isActive ? 'bg-ink-3' : ''}`}><Icon name={n.icon} className="h-5 w-5" /></span>
                  {n.label === 'My week' ? 'Week' : n.label === 'Dashboard' ? 'Home' : n.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

export function Notice({ tone, title, items }: { tone: 'amber' | 'blue'; title: string; items: string[] }) {
  if (!items.length) return null
  const styles = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-indigo-100 bg-ink-3 text-heading'
  return (
    <div className={`rounded-2xl border p-4 text-sm ${styles}`} role="note">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name={tone === 'amber' ? 'info' : 'shield'} className="h-4 w-4 shrink-0" />
        {title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((t) => <li key={t} className="leading-relaxed">{t}</li>)}
      </ul>
    </div>
  )
}
