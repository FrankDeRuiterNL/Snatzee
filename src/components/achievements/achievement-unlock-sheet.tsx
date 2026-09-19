'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Confetti } from '@/components/ui/confetti'
import { Button } from '@/components/ui/button'
import { RARITY_STYLES } from '@/lib/constants'
import type { UnlockedAchievement } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Shown right after an unlock, one achievement at a time. Queued unlocks are
 * advanced with "Volgende" so a triple unlock still feels deliberate.
 */
export function AchievementUnlockSheet({
  queue,
  onAdvance,
}: {
  queue: UnlockedAchievement[]
  onAdvance: () => void
}) {
  const current = queue[0]
  const remaining = Math.max(0, queue.length - 1)
  const rarity = current ? RARITY_STYLES[current.rarity] : null

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          role="alertdialog"
          aria-label="Achievement unlocked"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center"
        >
          <Confetti pieces={44} seed={queue.length} />

          <motion.div
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="relative z-10 w-full max-w-[34rem] rounded-t-[2rem] bg-surface-elevated px-6 pt-8 text-center shadow-float ring-1 ring-hairline-strong sm:rounded-[2rem]"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.75rem)' }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-mint-400">
              Achievement unlocked
            </p>

            <motion.div
              initial={{ scale: 0.5, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 14, stiffness: 240, delay: 0.08 }}
              className={cn(
                'mx-auto mt-6 grid size-24 place-items-center rounded-[1.75rem] bg-gradient-to-br text-5xl ring-4',
                rarity?.glow,
                rarity?.ring,
              )}
            >
              <span aria-hidden>{current.icon}</span>
            </motion.div>

            <span
              className={cn(
                'mt-5 inline-block rounded-full px-3 py-1 text-[0.7rem] font-bold uppercase tracking-widest',
                rarity?.chip,
              )}
            >
              {rarity?.label}
            </span>

            <h2 className="mt-3 text-3xl font-black tracking-tight text-ink">{current.name}</h2>
            <p className="mx-auto mt-2 max-w-[30ch] text-[0.95rem] leading-relaxed text-ink-muted">
              {current.description}
            </p>

            <Button full size="lg" variant="navy" className="mt-8" onClick={onAdvance}>
              {remaining > 0 ? `Volgende (${remaining})` : 'Lekker bezig!'}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
