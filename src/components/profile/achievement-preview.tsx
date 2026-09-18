import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { RARITY_STYLES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { AchievementWithUnlock } from '@/types/database'

/** Four most recent unlocks, with a link to the full list. */
export function AchievementPreview({
  achievements,
  href = '/app/achievements',
  showLink = true,
}: {
  achievements: AchievementWithUnlock[]
  href?: string
  showLink?: boolean
}) {
  const unlocked = achievements
    .filter((a) => a.unlocked_at)
    .sort((a, b) => (b.unlocked_at ?? '').localeCompare(a.unlocked_at ?? ''))

  const preview = unlocked.slice(0, 4)

  return (
    <section aria-labelledby="achievements-preview" className="px-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="achievements-preview" className="text-lg font-extrabold tracking-tight text-navy-900">
          Achievements
        </h2>
        <span className="tabular text-sm font-semibold text-navy-300">
          {unlocked.length} / {achievements.length}
        </span>
      </div>

      {preview.length === 0 ? (
        <div className="rounded-[1.5rem] bg-white p-6 text-center ring-1 ring-navy-100/70 shadow-soft">
          <p className="text-sm text-navy-300">
            Nog niets vrijgespeeld. Begin met spelen om achievements te verdienen.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {preview.map((achievement) => {
            const rarity = RARITY_STYLES[achievement.rarity]
            return (
              <div
                key={achievement.id}
                title={achievement.name}
                className="flex flex-col items-center rounded-2xl bg-white p-3 ring-1 ring-navy-100/70 shadow-soft"
              >
                <span
                  className={cn(
                    'grid size-11 place-items-center rounded-xl bg-gradient-to-br text-2xl',
                    rarity.glow,
                  )}
                >
                  <span aria-hidden>{achievement.icon}</span>
                </span>
                <span className="mt-1.5 line-clamp-1 text-[0.65rem] font-bold text-navy-500">
                  {achievement.name}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {showLink && (
        <Link
          href={href}
          className="press mt-3 flex min-h-12 items-center justify-center gap-1 rounded-2xl bg-white text-sm font-semibold text-navy-900 ring-1 ring-navy-100/70 shadow-soft"
        >
          Bekijk alle achievements
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </section>
  )
}
