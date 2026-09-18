import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Award, ChevronRight, Dice5, Target, TrendingUp, Trophy, Zap } from 'lucide-react'
import { HomeHeader } from '@/components/home/home-header'
import { HeroStatCard } from '@/components/home/hero-stat-card'
import { QuickActions } from '@/components/home/quick-actions'
import { InsightCard, nextGamesAchievement } from '@/components/home/insight-card'
import { RecentScores } from '@/components/home/recent-scores'
import { StatCard } from '@/components/ui/stat-card'
import { PageTransition } from '@/components/layout/page-transition'
import {
  getAchievementsForUser,
  getCurrentProfile,
  getHomeSummary,
  getRecentScores,
  getUserStatistics,
} from '@/lib/supabase/queries'
import { formatNumber } from '@/lib/utils'

export const metadata = { title: 'Home' }
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')

  const [summary, recent, achievements, stats] = await Promise.all([
    getHomeSummary(),
    getRecentScores(profile.id, 4),
    getAchievementsForUser(profile.id),
    getUserStatistics(profile.id),
  ])

  if (!summary) redirect('/login')

  const unlockedCount = achievements.filter((a) => a.unlocked_at).length

  return (
    <PageTransition>
      <HomeHeader
        displayName={profile.display_name}
        username={profile.username}
        avatarUrl={profile.avatar_url}
        levelEmoji={stats?.level_emoji ?? null}
        levelName={stats?.level_name ?? null}
      />

      <div className="space-y-6">
        <HeroStatCard summary={summary} />

        <QuickActions />

        <InsightCard
          summary={summary}
          nextAchievement={nextGamesAchievement(achievements, summary.games_played)}
        />

        <section aria-label="Jouw cijfers" className="grid grid-cols-2 gap-3 px-5">
          <StatCard
            label="Potjes"
            value={formatNumber(summary.games_played)}
            icon={Dice5}
            accent="navy"
          />
          <StatCard
            label="Gewonnen"
            value={formatNumber(summary.wins)}
            hint={`${formatNumber(summary.win_rate, 0)}% winst`}
            icon={Trophy}
            accent="mint"
          />
          <StatCard
            label="Yahtzee's"
            value={formatNumber(summary.yahtzee_count)}
            hint={`${formatNumber(summary.first_roll_yahtzee_count)} in één worp`}
            icon={Target}
            accent="grape"
          />
          <StatCard
            label="Gemiddelde"
            value={
              summary.average_score === null
                ? '—'
                : formatNumber(summary.average_score, summary.average_score % 1 === 0 ? 0 : 1)
            }
            icon={TrendingUp}
            accent="aqua"
          />
          <StatCard
            label="Persoonlijk record"
            value={summary.highest_score === null ? '—' : formatNumber(summary.highest_score)}
            icon={Zap}
            accent="tangerine"
            className="col-span-2"
          />
        </section>

        <section className="px-5">
          <Link
            href="/app/achievements"
            className="press flex items-center gap-4 rounded-[1.5rem] bg-navy-900 p-4 text-white shadow-soft"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-mint-400">
              <Award className="size-5" strokeWidth={2.4} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold tracking-tight">Achievements</span>
              <span className="mt-0.5 block text-sm text-navy-300">
                {unlockedCount} van {achievements.length} vrijgespeeld
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-navy-300" aria-hidden />
          </Link>
        </section>

        <RecentScores entries={recent} />
      </div>
    </PageTransition>
  )
}
