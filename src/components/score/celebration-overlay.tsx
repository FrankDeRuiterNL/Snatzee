'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Confetti } from '@/components/ui/confetti'

export interface Celebration {
  id: number
  variant: 'yahtzee' | 'firstRoll' | 'record'
  title: string
  headline: string
  detail?: string
  emoji: string
}

/**
 * Full-screen celebration. A first-roll Yahtzee gets a noticeably bigger
 * moment than a regular one: more confetti, larger type, heavier glow.
 */
export function CelebrationOverlay({
  celebration,
  onDismiss,
}: {
  celebration: Celebration | null
  onDismiss: () => void
}) {
  const big = celebration?.variant === 'firstRoll'

  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={celebration.id}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onDismiss}
          className="fixed inset-0 z-[60] grid place-items-center bg-navy-950/80 px-6 backdrop-blur-md"
        >
          <Confetti pieces={big ? 64 : 34} seed={celebration.id} />

          <motion.div
            initial={{ scale: 0.7, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 18, stiffness: 260 }}
            className="relative z-10 flex flex-col items-center text-center"
          >
            <motion.span
              aria-hidden
              initial={{ rotate: 0, scale: 0.6 }}
              animate={{ rotate: big ? [0, 360, 720] : [0, 360], scale: 1 }}
              transition={{ duration: big ? 1.1 : 0.75, ease: [0.34, 1.56, 0.64, 1] }}
              className={
                big
                  ? 'text-[5.5rem] leading-none drop-shadow-[0_0_40px_rgba(255,122,61,0.55)]'
                  : 'text-[4.5rem] leading-none drop-shadow-[0_0_32px_rgba(36,199,154,0.5)]'
              }
            >
              {celebration.emoji}
            </motion.span>

            <p
              className={
                big
                  ? 'mt-6 text-sm font-bold uppercase tracking-[0.3em] text-tangerine-400'
                  : 'mt-6 text-sm font-bold uppercase tracking-[0.3em] text-mint-400'
              }
            >
              {celebration.title}
            </p>

            <h2
              className={
                big
                  ? 'mt-2 text-4xl font-black leading-tight tracking-tight text-white'
                  : 'mt-2 text-3xl font-black leading-tight tracking-tight text-white'
              }
            >
              {celebration.headline}
            </h2>

            {celebration.detail && (
              <p className="mt-3 max-w-[26ch] text-base font-medium text-navy-100">
                {celebration.detail}
              </p>
            )}

            <button
              type="button"
              onClick={onDismiss}
              className="press mt-9 min-h-12 rounded-full bg-white/10 px-7 text-sm font-semibold text-white ring-1 ring-white/20"
            >
              Top!
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
