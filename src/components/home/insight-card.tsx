import { Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { HomeSummary } from '@/types/database'
import type { AchievementWithUnlock } from '@/types/database'

/**
 * A single, genuinely useful line of personalisation, picked from live data.
 * Nothing is shown when there is nothing worth saying.
 */
function buildInsight(
  summary: HomeSummary,
  nextAchievement: { name: string; remaining: number } | null,
): { text: string; href?: string } | null {
  if (summary.games_played === 0) return null

  if (summary.current_win_streak >= 3) {
    return {
      text: `Je won ${summary.current_win_streak} potjes achter elkaar — lekker bezig! 🔥`,
      href: '/app/history?filter=won',
    }
  }

  if (summary.average_this_month !== null && summary.average_last_month !== null) {
    const delta = Math.round((summary.average_this_month - summary.average_last_month) * 10) / 10
    if (delta >= 5) {
      return {
        text: `Je gemiddelde is deze maand ${delta} punten hoger dan vorige maand.`,
        href: '/app/statistics',
      }
    }
    if (delta <= -5) {
      return {
        text: `Je gemiddelde ligt deze maand ${Math.abs(delta)} punten lager. Tijd voor revanche.`,
        href: '/app/statistics',
      }
    }
  }

  if (nextAchievement && nextAchievement.remaining > 0 && nextAchievement.remaining <= 5) {
    return {
      text: `Nog ${nextAchievement.remaining} ${nextAchievement.remaining === 1 ? 'potje' : 'potjes'} tot "${nextAchievement.name}".`,
      href: '/app/achievements',
    }
  }

  if (summary.games_today > 0) {
    return {
      text: `${summary.games_today} ${summary.games_today === 1 ? 'potje' : 'potjes'} vandaag geregistreerd. 🎲`,
    }
  }

  return null
}

/** Finds the closest games-played achievement still locked. */
export function nextGamesAchievement(
  achievements: AchievementWithUnlock[],
  gamesPlayed: number,
): { name: string; remaining: number } | null {
  const candidates = achievements
    .filter((a) => !a.unlocked_at && !a.is_secret)
    .map((a) => {
      const criteria = a.criteria as { type?: string; gte?: number }
      if (criteria.type !== 'games_played' || typeof criteria.gte !== 'number') return null
      return { name: a.name, remaining: criteria.gte - gamesPlayed }
    })
    .filter((c): c is { name: string; remaining: number } => c !== null && c.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining)

  return candidates[0] ?? null
}

export function InsightCard({
  summary,
  nextAchievement,
}: {
  summary: HomeSummary
  nextAchievement: { name: string; remaining: number } | null
}) {
  const insight = buildInsight(summary, nextAchievement)
  if (!insight) return null

  const content = (
    <div className="mx-5 flex items-center gap-3 rounded-[1.5rem] bg-gradient-to-br from-mint-100 to-cream-50 p-4 ring-1 ring-mint-300/40">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-mint-600 shadow-soft">
        <Sparkles className="size-5" strokeWidth={2.4} aria-hidden />
      </span>
      <p className="text-[0.9rem] font-semibold leading-snug text-navy-700">{insight.text}</p>
    </div>
  )

  return insight.href ? (
    <Link href={insight.href} className="press block">
      {content}
    </Link>
  ) : (
    content
  )
}
