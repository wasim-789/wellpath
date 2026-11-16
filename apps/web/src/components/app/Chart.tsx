/**
 * A Chart.js chart in React. Only the parts the app uses are registered, which keeps the bundle small.
 * The chart is rebuilt when its config changes and destroyed when the component goes away.
 */
import { useEffect, useRef } from 'react'
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip,
  type ChartConfiguration,
} from 'chart.js'

ChartJS.register(BarController, BarElement, CategoryScale, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip)

ChartJS.defaults.font.family = 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif'
ChartJS.defaults.color = '#6b7280'

export function Chart({ config, label, className = 'h-56' }: { config: ChartConfiguration; label: string; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvas.current) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const chart = new ChartJS(canvas.current, {
      ...config,
      options: { responsive: true, maintainAspectRatio: false, ...(reduced ? { animation: false } : {}), ...config.options },
    })
    return () => chart.destroy()
  }, [config])

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  )
}
