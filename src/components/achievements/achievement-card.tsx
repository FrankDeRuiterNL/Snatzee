'use client'

import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { RARITY_STYLES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { AchievementWithUnlock } from '@/types/database'

export function AchievementCard({
  achievement,
  index = 0,
  onClick,
}: {
  achievement: AchievementWithUnlock
  index?: number
  onClick?: () => void
}) {
  const unlocked = Boolean(achievement.unlocked_at)
  const rarity = RARITY_STYLES[achievement.rarity]
  // Secret achievements stay hidden — icon, name and description — until earned.
  const hidden = achievement.is_secret && !unlocked

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.025, 0.35) }}
      whileTap={{ scale: 0.97 }}
      aria-label={hidden ? 'Verborgen achievement' : `${achievement.name} — ${achievement.description}`}
      className={cn(
        'press flex flex-col items-center rounded-[1.5rem] p-4 text-center ring-1 transition-colors',
        unlocked
          ? 'bg-white ring-navy-100/70 shadow-soft'
          : 'bg-cream-50/60 ring-navy-100/50',
      )}
    >
      <span
        className={cn(
          'grid size-14 place-items-center rounded-2xl text-3xl',
          unlocked ? cn('bg-gradient-to-br', rarity.glow) : 'bg-navy-100/40',
        )}
      >
        {hidden ? (
          <Lock className="size-6 text-navy-300" aria-hidden strokeWidth={2.4} />
        ) : (
          <span aria-hidden className={unlocked ? '' : 'opacity-40 grayscale'}>
            {achievement.icon}
          </span>
        )}
      </span>

      <span
        className={cn(
          'mt-3 line-clamp-2 text-sm font-bold leading-tight tracking-tight',
          unlocked ? 'text-navy-900' : 'text-navy-300',
        )}
      >
        {hidden ? 'Verborgen' : achievement.name}
      </span>

      <span
        className={cn(
          'mt-1.5 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest',
          unlocked ? rarity.chip : 'bg-navy-100/40 text-navy-300',
        )}
      >
        {rarity.label}
      </span>
    </motion.button>
  )
}
