'use client'

import { motion } from 'framer-motion'
import { Plus, Zap } from 'lucide-react'
import { useQuickActions } from '@/components/layout/quick-actions-provider'
import { haptic } from '@/lib/haptics'

/**
 * The three registration shortcuts. "Potje toevoegen" is deliberately the
 * widest and heaviest of the three — it is the app's primary action.
 */
export function QuickActions() {
  const { openScoreSheet, recordYahtzee, yahtzeePending } = useQuickActions()

  return (
    <section aria-label="Snel registreren" className="grid grid-cols-2 gap-3 px-5">
      <motion.button
        type="button"
        whileTap={{ scale: 0.97 }}
        onClick={() => {
          haptic('medium')
          openScoreSheet()
        }}
        className="col-span-2 flex min-h-16 items-center justify-center gap-2.5 rounded-[1.5rem] bg-mint-500 text-lg font-extrabold tracking-tight text-navy-950 shadow-[0_10px_30px_-10px_rgba(36,199,154,0.8)]"
      >
        <Plus className="size-6" strokeWidth={2.8} aria-hidden />
        Potje toevoegen
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={yahtzeePending}
        onClick={() => void recordYahtzee('NORMAL')}
        className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-[1.5rem] bg-white ring-1 ring-navy-100/70 shadow-soft disabled:opacity-60"
      >
        <span className="text-2xl" aria-hidden>
          🎲
        </span>
        <span className="text-sm font-bold text-navy-900">Yahtzee</span>
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={yahtzeePending}
        onClick={() => void recordYahtzee('FIRST_ROLL')}
        className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-[1.5rem] bg-navy-900 text-white shadow-soft disabled:opacity-60"
      >
        <Zap className="size-6 text-tangerine-400" strokeWidth={2.6} aria-hidden />
        <span className="text-sm font-bold">1 worp</span>
      </motion.button>
    </section>
  )
}
