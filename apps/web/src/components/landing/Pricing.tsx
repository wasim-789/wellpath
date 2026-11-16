import { Icon, Reveal, SectionHeading } from './ui'

/**
 * One plan: WellPath is free during beta. Only features that exist or are on the roadmap are listed,
 * and the ones still being built say so.
 */
const items: { text: string; soon?: boolean }[] = [
  { text: 'Personal food and home workout plan' },
  { text: 'Safety rules for injuries and health conditions' },
  { text: 'Daily tracker, streaks and progress charts' },
  { text: 'Log food in Roman Urdu or English' },
  { text: 'AI coach, with a daily question limit', soon: true },
  { text: 'Weekly adaptive targets and report', soon: true },
  { text: 'Ramadan mode', soon: true },
]

export function Pricing() {
  return (
    <section id="pricing" className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="Pricing" title={<>Free while in beta. <span className="text-gradient">Stay because it works.</span></>} />
        <Reveal className="mx-auto mt-14 max-w-md">
          <div className="card relative flex flex-col border-violet/50 p-7 shadow-[0_0_60px_-20px_rgba(79,70,229,0.45)]">
            <p className="font-semibold text-heading">Free</p>
            <p className="mt-3 text-4xl font-extrabold text-heading">$0</p>
            <p className="mt-1 text-sm text-muted">Free during beta. No card needed.</p>
            <ul className="mt-6 flex-1 space-y-3">
              {items.map((it) => (
                <li key={it.text} className="flex items-start gap-2.5 text-sm text-text">
                  <Icon name="check" className={`mt-0.5 h-4 w-4 shrink-0 ${it.soon ? 'text-muted' : 'text-mint'}`} />
                  <span>
                    {it.text}
                    {it.soon && <span className="ml-2 rounded-full bg-ink-3 px-2 py-0.5 text-[11px] font-semibold text-violet">Coming soon</span>}
                  </span>
                </li>
              ))}
            </ul>
            <a href="/signup" className="btn-primary mt-8 rounded-full px-6 py-3 text-center text-sm font-semibold text-white">Build my free plan</a>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
