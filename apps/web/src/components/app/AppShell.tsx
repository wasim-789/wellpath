/**
 * Frame for signed-in pages.
 *  - Large screens: a sidebar that can be collapsed to a slim icon rail and expanded again (the choice is remembered).
 *  - Phones and tablets: a top bar with a menu button that slides the sidebar in as a drawer, plus a tab bar
 *    at the bottom, so every section is one tap away.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { LogoMark } from '../landing/ui'
import { logout, useAuth } from '../../lib/auth'
import { Icon, type IconName } from './Icon'

const NAV: { to: string; label: string; short?: string; icon: IconName; end?: boolean }[] = [
  { to: '/app', label: 'Dashboard', short: 'Home', icon: 'home', end: true },
  { to: '/week', label: 'My week', short: 'Week', icon: 'calendar' },
  { to: '/meals', label: 'Meals', icon: 'bowl' },
  { to: '/workouts', label: 'Workouts', icon: 'dumbbell' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const COLLAPSED_KEY = 'wellpath:sidebar-collapsed'

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
}
function saveCollapsed(on: boolean) {
  try { localStorage.setItem(COLLAPSED_KEY, on ? '1' : '0') } catch { /* storage blocked: remembered for this visit only */ }
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'

// After logout the protected page sends you home, where the "logged out" message shows.
const signOut = () => void logout()

/** The sidebar's contents, used by the desktop sidebar (wide or slim) and the phone drawer. */
function SidebarNav({ slim, onNavigate }: { slim: boolean; onNavigate?: () => void }) {
  const auth = useAuth()
  const user = auth.status === 'signed-in' ? auth.user : null
  return (
    <>
      {/*
        Scrolling only in the wide sidebar. overflow-y: auto also makes the list scroll sideways, which in the
        slim rail turned the tooltips (they stick out to the right) into a horizontal scrollbar. Six icons always fit.
      */}
      <nav className={`flex-1 space-y-1 py-4 ${slim ? 'overflow-visible px-2.5' : 'overflow-y-auto px-3'}`} aria-label="Main">
        {NAV.map((n) => (
          <NavLink
            key={n.to} to={n.to} end={n.end} onClick={onNavigate}
            className={({ isActive }) => `group relative flex items-center rounded-xl text-sm font-semibold transition ${slim ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'} ${
              isActive ? 'bg-ink-3 text-violet' : 'text-text hover:bg-ink-2 hover:text-heading'}`}
          >
            {({ isActive }) => (
              <>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${isActive ? 'btn-primary text-white' : 'bg-ink-2 text-muted group-hover:text-violet'}`}>
                  <Icon name={n.icon} className="h-[18px] w-[18px]" />
                </span>
                {slim ? (
                  // The label still reaches screen readers, and shows as a tooltip on hover or keyboard focus.
                  <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg bg-heading px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    {n.label}
                  </span>
                ) : n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className={`m-3 rounded-2xl border border-line bg-ink-2/60 ${slim ? 'p-2' : 'p-3'}`}>
        <div className={`flex items-center ${slim ? 'justify-center' : 'gap-3'}`}>
          <span className="btn-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" title={slim ? `${user?.name ?? ''} · ${user?.email ?? ''}` : undefined}>{initials(user?.name ?? '')}</span>
          {!slim && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-heading">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
          )}
        </div>
        <button
          type="button" onClick={signOut} aria-label={slim ? 'Log out' : undefined} title={slim ? 'Log out' : undefined}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-white py-2 text-sm font-semibold text-heading transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 ${slim ? 'px-0' : 'px-3'}`}
        >
          <Icon name="logout" className="h-4 w-4" />{!slim && ' Log out'}
        </button>
      </div>
    </>
  )
}

/** The slide-in sidebar for phones and tablets. Closes with the ✕ button, a tap outside, Escape, or picking a page. */
function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Keep the page behind still while the drawer is open.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-heading/40 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside
        id="app-drawer" role="dialog" aria-modal="true" aria-label="Menu" inert={!open}
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Link to="/app" onClick={onClose} className="flex items-center gap-2.5" aria-label="WellPath dashboard"><LogoMark /></Link>
          <button ref={closeButton} type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-heading hover:bg-ink-2" aria-label="Close menu">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <SidebarNav slim={false} onNavigate={onClose} />
      </aside>
    </div>
  )
}

export function AppShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  const auth = useAuth()
  const user = auth.status === 'signed-in' ? auth.user : null
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawer, setDrawer] = useState(false)
  const closeDrawer = useCallback(() => setDrawer(false), [])

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      saveCollapsed(!c)
      return !c
    })
  }

  return (
    <div className="min-h-screen bg-ink-2">
      {/* Sidebar, large screens: wide, or a slim icon rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-white transition-[width] duration-300 ease-out motion-reduce:transition-none lg:flex ${collapsed ? 'w-20' : 'w-64'}`}
        aria-label="Sidebar"
      >
        <div className={`flex h-16 shrink-0 items-center ${collapsed ? 'justify-center' : 'justify-between pl-6 pr-3'}`}>
          {!collapsed && <Link to="/app" className="flex items-center gap-2.5" aria-label="WellPath dashboard"><LogoMark /></Link>}
          <button
            type="button" onClick={toggleCollapsed} aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'} title={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted transition hover:bg-ink-2 hover:text-violet"
          >
            <Icon name={collapsed ? 'sidebar' : 'chevronLeft'} className="h-5 w-5" />
          </button>
        </div>
        <SidebarNav slim={collapsed} />
      </aside>

      {/* Top bar, phones and tablets */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => setDrawer(true)} aria-label="Open the menu" aria-expanded={drawer} aria-controls="app-drawer"
              className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-xl text-heading hover:bg-ink-2"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>
            <Link to="/app" className="flex items-center gap-2.5" aria-label="WellPath dashboard"><LogoMark /></Link>
          </div>
          <span className="btn-primary flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" title={user?.email}>{initials(user?.name ?? '')}</span>
        </div>
      </header>

      <Drawer open={drawer} onClose={closeDrawer} />

      <div className={`transition-[padding] duration-300 ease-out motion-reduce:transition-none ${collapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
        <main className={`mx-auto px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:pb-10 lg:pt-10 ${narrow ? 'max-w-2xl' : 'max-w-6xl'}`}>{children}</main>
        <p className="hidden pb-8 text-center text-xs text-muted lg:block">Wellness guidance only. Not medical advice.</p>
      </div>

      {/* Tab bar, phones and tablets */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick links">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-violet' : 'text-muted'}`}>
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${isActive ? 'bg-ink-3' : ''}`}><Icon name={n.icon} className="h-5 w-5" /></span>
                  {n.short ?? n.label}
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
