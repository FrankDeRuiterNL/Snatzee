import { redirect } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  Dice5,
  Percent,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { StatCard } from '@/components/ui/stat-card'
import { ScoreChart } from '@/components/stats/score-chart'
import { LevelCard } from '@/components/profile/level-badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getCurrentProfile,
  getHomeSummary,
  getRecentScores,
  getUserStatistics,
} from '@/lib/supabase/queries'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Statistieken' }
export const dynamic = 'force-dynamic'

export default async function StatisticsPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const [stats, summary, scores] = await Promise.all([
    getUserStatistics(profile.id),
    getHomeSummary(),
    getRecentScores(profile.id, 100),
  ])

  if (!stats || stats.games_played === 0) {
    return (
      <PageTransition>
        <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
          <PageHeader title="Statistieken" backHref="/app/profile" />
        </div>
        <div className="px-5">
          <EmptyState
            emoji="📊"
            title="Nog geen statistieken"
            description="Zodra je je eerste potjes registreert verschijnen hier je cijfers en grafieken."
          />
        </div>
      </PageTransition>
    )
  }

  const last10 = summary?.average_last_10 ?? null
  const allTime = stats.average_score
  const formDelta =
    last10 !== null && allTime !== null ? Math.round((last10 - allTime) * 10) / 10 : null

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Statistieken"
          subtitle="Alles wat je cijfers te vertellen hebben."
          backHref="/app/profile"
        />
      </div>

      <div className="space-y-6">
        <section aria-labelledby="form-heading" className="mx-5">
          <h2 id="form-heading" className="sr-only">
            Vorm
          </h2>
          <div className="rounded-[1.75rem] bg-navy-900 p-6 text-white shadow-lift">
            <p className="text-sm font-semibold text-navy-300">Gemiddelde laatste 10 potjes</p>
            <p className="tabular mt-1 text-[3rem] font-black leading-none tracking-tight">
              {last10 === null ? '—' : formatNumber(last10, last10 % 1 === 0 ? 0 : 1)}
            </p>
            {formDelta !== null && (
              <p
                className={`mt-3 inline-flex items-center gap-1.5 text-sm font-semibold ${
                  formDelta >= 0 ? 'text-mint-400' : 'text-tangerine-400'
                }`}
              >
                {formDelta >= 0 ? (
                  <ArrowUp className="size-4" aria-hidden strokeWidth={2.6} />
                ) : (
                  <ArrowDown className="size-4" aria-hidden strokeWidth={2.6} />
                )}
                {formDelta >= 0 ? '+' : ''}
                {formatNumber(formDelta, formDelta % 1 === 0 ? 0 : 1)} t.o.v. je all-time gemiddelde
              </p>
            )}
          </div>
        </section>

        <LevelCard stats={stats} />

        <section aria-labelledby="chart-heading" className="space-y-3 px-5">
          <h2 id="chart-heading" className="text-lg font-extrabold tracking-tight text-navy-900">
            Scoreontwikkeling
          </h2>
          <ScoreChart
            points={scores.map((s) => ({
              score: s.score,
              played_at: s.played_at,
              is_win: s.is_win,
            }))}
            average={allTime}
          />
        </section>

        <section aria-labelledby="numbers-heading" className="px-5">
          <h2
            id="numbers-heading"
            className="mb-3 text-lg font-extrabold tracking-tight text-navy-900"
          >
            Alle cijfers
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Gespeelde potjes"
              value={formatNumber(stats.games_played)}
              icon={Dice5}
              accent="navy"
            />
            <StatCard
              label="Overwinningen"
              value={formatNumber(stats.wins)}
              icon={Trophy}
              accent="mint"
            />
            <StatCard
              label="Winpercentage"
              value={`${formatNumber(stats.win_rate, stats.win_rate % 1 === 0 ? 0 : 1)}%`}
              icon={Percent}
              accent="mint"
            />
            <StatCard
              label="Gemiddelde score"
              value={allTime === null ? '—' : formatNumber(allTime, allTime % 1 === 0 ? 0 : 1)}
              icon={TrendingUp}
              accent="aqua"
            />
            <StatCard
              label="Hoogste score"
              value={stats.highest_score === null ? '—' : formatNumber(stats.highest_score)}
              icon={ArrowUp}
              accent="tangerine"
            />
            <StatCard
              label="Laagste score"
              value={stats.lowest_score === null ? '—' : formatNumber(stats.lowest_score)}
              icon={ArrowDown}
              accent="rose"
            />
            <StatCard
              label="Yahtzee's"
              value={formatNumber(stats.yahtzee_count)}
              icon={Target}
              accent="grape"
            />
            <StatCard
              label="In één worp"
              value={formatNumber(stats.first_roll_yahtzee_count)}
              icon={Zap}
              accent="tangerine"
            />
          </div>
        </section>
      </div>
    </PageTransition>
  )
}
