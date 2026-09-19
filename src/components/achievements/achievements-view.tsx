'use client'

import { useMemo, useState } from 'react'
import { AchievementCard } from '@/components/achievements/achievement-card'
import { BottomSheet } from '@/components/ui/sheet'
import { ChipScroller } from '@/components/ui/segmented'
import { Progress } from '@/components/ui/progress'
import { RARITY_STYLES, ACHIEVEMENT_CATEGORIES } from '@/lib/constants'
import { cn, formatPlayedAt } from '@/lib/utils'
import type { AchievementWithUnlock } from '@/types/database'

type Category = (typeof ACHIEVEMENT_CATEGORIES)[number]['key']

export function AchievementsView({ achievements }: { achievements: AchievementWithUnlock[] }) {
  const [category, setCategory] = useState<Category>('all')
  const [detail, setDetail] = useState<AchievementWithUnlock | null>(null)

  const unlockedCount = achievements.filter((a) => a.unlocked_at).length

  const visible = useMemo(() => {
    if (category === 'all') return achievements
    if (category === 'secret') return achievements.filter((a) => a.is_secret)
    return achievements.filter((a) => a.category === category && !a.is_secret)
  }, [achievements, category])

  const detailHidden = detail?.is_secret && !detail.unlocked_at
  const rarity = detail ? RARITY_STYLES[detail.rarity] : null

  return (
    <div className="space-y-5">
      <section className="mx-5 rounded-[1.75rem] bg-surface-elevated p-6 text-white shadow-lift">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-ink-muted">Vrijgespeeld</p>
          <p className="tabular text-sm font-bold text-mint-400">
            {Math.round((unlockedCount / Math.max(achievements.length, 1)) * 100)}%
          </p>
        </div>
        <p className="tabular mt-1 text-4xl font-black tracking-tight">
          {unlockedCount}
          <span className="text-2xl font-extrabold text-ink-muted"> / {achievements.length}</span>
        </p>
        <Progress
          value={unlockedCount}
          max={achievements.length}
          label="Achievement voortgang"
          className="mt-4 bg-surface/10"
          barClassName="bg-mint-500"
        />
      </section>

      <div className="px-5">
        <ChipScroller
          ariaLabel="Achievement categorie"
          options={ACHIEVEMENT_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
          value={category}
          onChange={setCategory}
        />
      </div>

      <div className="grid grid-cols-3 gap-3 px-5">
        {visible.map((achievement, index) => (
          <AchievementCard
            key={achievement.id}
            achievement={achievement}
            index={index}
            onClick={() => setDetail(achievement)}
          />
        ))}
      </div>

      <BottomSheet
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        title={detailHidden ? 'Verborgen achievement' : (detail?.name ?? '')}
      >
        {detail && (
          <div className="pb-4 text-center">
            <span
              className={cn(
                'mx-auto grid size-24 place-items-center rounded-[1.75rem] text-5xl ring-4',
                detail.unlocked_at
                  ? cn('bg-gradient-to-br', rarity?.glow, rarity?.ring)
                  : 'bg-white/10 ring-hairline',
              )}
            >
              <span aria-hidden className={detail.unlocked_at ? '' : 'opacity-40 grayscale'}>
                {detailHidden ? '🔒' : detail.icon}
              </span>
            </span>

            <span
              className={cn(
                'mt-4 inline-block rounded-full px-3 py-1 text-[0.7rem] font-bold uppercase tracking-widest',
                detail.unlocked_at ? rarity?.chip : 'bg-white/10 text-ink-muted',
              )}
            >
              {rarity?.label}
            </span>

            <p className="mx-auto mt-4 max-w-[32ch] text-[0.95rem] leading-relaxed text-ink-soft">
              {detailHidden
                ? 'Deze achievement blijft geheim tot je hem vrijspeelt. Blijf spelen!'
                : detail.description}
            </p>

            <p className="mt-5 text-sm font-semibold text-ink-muted">
              {detail.unlocked_at
                ? `Vrijgespeeld op ${formatPlayedAt(detail.unlocked_at)}`
                : 'Nog niet vrijgespeeld'}
            </p>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
