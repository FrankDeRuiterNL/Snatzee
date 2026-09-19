'use client'

import { motion } from 'framer-motion'
import { Plus, Zap } from 'lucide-react'
import { useQuickActions } from '@/components/layout/quick-actions-provider'
import { haptic } from '@/lib/haptics'

/**
 * Two registration shortcuts.
 *
 * A normal Yahtzee is reported as part of a finished game, so it has no
 * button of its own; only the first-roll Yahtzee is worth interrupting for,
 * because it is celebrated the moment it happens.
 */
export function QuickActions() {
  const { openScoreSheet, askFirstRollYahtzee, yahtzeePending } = useQuickActions()

  return (
    <section aria-label="Snel registreren" className="space-y-3 px-5">
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          haptic('medium')
          openScoreSheet()
        }}
        className="glow-mint flex min-h-16 w-full items-center justify-center gap-2.5 rounded-[1.5rem] bg-mint-500 text-lg font-extrabold tracking-tight text-navy-950"
      >
        <Plus className="size-6" strokeWidth={2.8} aria-hidden />
        Potje toevoegen
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        disabled={yahtzeePending}
        onClick={() => {
          haptic('medium')
          askFirstRollYahtzee()
        }}
        className="card-elevated sheen flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[1.5rem] text-[0.95rem] font-bold text-ink disabled:opacity-60"
      >
        <Zap className="size-5 text-tangerine-400" strokeWidth={2.6} aria-hidden />
        Yahtzee in 1 worp
      </motion.button>
    </section>
  )
}
