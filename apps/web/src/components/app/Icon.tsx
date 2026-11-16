/** Line icons for the signed-in app, drawn inline (24×24, stroke) so no icon library or image files are needed. */
import type { ReactNode } from 'react'

const paths = {
  home: <><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /><path d="M8.5 14h2M13.5 14h2M8.5 17h2" /></>,
  bowl: <><path d="M4 11h16a8 8 0 01-16 0z" /><path d="M9 7.5c0-1.5 1-2 1-3.5M13 7.5c0-1.5 1-2 1-3.5" /></>,
  dumbbell: <><path d="M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5" /><path d="M6.5 12h11" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>,
  logout: <><path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  flame: <path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.2 2.3-5.4 3.8-7.6.4 1.6 1.3 2.7 2.4 3.2C11.4 6.6 13 4.4 15.5 3c-.4 2.9.8 4.7 2 6.4 1 1.4 1.5 2.9 1.5 4.6C19 18.1 15.9 21 12 21z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></>,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  sunrise: <><path d="M5 17a7 7 0 0114 0" /><path d="M3 20h18M12 4v3M5.6 9.6l1.4 1.4M18.4 9.6L17 11" /></>,
  cup: <><path d="M5 9h11v5a5 5 0 01-5 5h-1a5 5 0 01-5-5z" /><path d="M16 10.5h1.5a2.5 2.5 0 010 5H16M8.5 3.5c0 1.2-1 1.5-1 2.7M12 3.5c0 1.2-1 1.5-1 2.7" /></>,
  moon: <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />,
  edit: <><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  shield: <><path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  check: <path d="M5 12l4 4 10-10" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />,
  swap: <><path d="M4 8h13l-3.5-3.5" /><path d="M20 16H7l3.5 3.5" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  refresh: <><path d="M20 11a8 8 0 00-14.5-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0014.5 4.5L20 16" /><path d="M20 20v-4h-4" /></>,
  pause: <path d="M8.5 5.5v13M15.5 5.5v13" />,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" /></>,
  checkCircle: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.8-5" /></>,
  repeat: <><path d="M17 3l3 3-3 3" /><path d="M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3" /><path d="M20 13v2a3 3 0 01-3 3H4" /></>,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16l4-5 3 3 5-7" /></>,
  drop: <path d="M12 3.5c3 4 6 7.2 6 10.5a6 6 0 01-12 0c0-3.3 3-6.5 6-10.5z" />,
  scale: <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9.5a4.5 4.5 0 016 0L13 12" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  sidebar: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9.5 4.5v15" /></>,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  minus: <path d="M5 12h14" />,
  heart:<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.3a4.3 4.3 0 017.5 2.5C19.5 15.4 12 20 12 20z" />,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof paths

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
