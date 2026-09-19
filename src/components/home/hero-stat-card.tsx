import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import type { HomeSummary } from '@/types/database'

/** The big navy stat card that anchors the dashboard. */
export function HeroStatCard({ summary }: { summary: HomeSummary }) {
  const average = summary.average_score
  const thisMonth = summary.average_this_month
  const lastMonth = summary.average_last_month
  const delta =
    thisMonth !== null && lastMonth !== null ? Math.round((thisMonth - lastMonth) * 10) / 10 : null

  const Trend = delta === null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight
  const trendTone =
    delta === null || delta === 0
      ? 'text-ink-muted'
      : delta > 0
        ? 'text-mint-400'
        : 'text-tangerine-400'

  return (
    <section
      aria-labelledby="hero-average"
      className="mx-5 rounded-[1.75rem] bg-surface-elevated p-6 text-white shadow-lift"
    >
      <p id="hero-average" className="text-sm font-semibold text-ink-muted">
        Jouw gemiddelde
      </p>

      <p className="tabular mt-1 text-[3.5rem] font-black leading-none tracking-tight">
        {average === null ? '—' : formatNumber(average, average % 1 === 0 ? 0 : 1)}
      </p>

      <p className={`mt-3 inline-flex items-center gap-1.5 text-sm font-semibold ${trendTone}`}>
        <Trend className="size-4" aria-hidden strokeWidth={2.6} />
        {delta === null
          ? 'Nog geen vergelijking met vorige maand'
          : delta === 0
            ? 'Gelijk aan vorige maand'
            : `${delta > 0 ? '+' : ''}${formatNumber(delta, delta % 1 === 0 ? 0 : 1)} sinds vorige maand`}
      </p>

      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Potjes" value={formatNumber(summary.games_played)} />
        <MiniStat label="Gewonnen" value={formatNumber(summary.wins)} />
        <MiniStat label="Record" value={summary.highest_score === null ? '—' : formatNumber(summary.highest_score)} />
      </dl>
    </section>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface/5 py-3">
      <dd className="tabular text-xl font-extrabold">{value}</dd>
      <dt className="mt-0.5 text-[0.7rem] font-semibold text-ink-muted">{label}</dt>
    </div>
  )
}
