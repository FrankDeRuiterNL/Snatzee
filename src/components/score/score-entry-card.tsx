'use client'

import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import type { ScoreEntry } from '@/types/database'

/** One registered game, rendered as a tappable card rather than a table row. */
export function ScoreEntryCard({
  entry,
  onClick,
  index = 0,
}: {
  entry: ScoreEntry
  onClick?: () => void
  index?: number
}) {
  const Wrapper = onClick ? motion.button : motion.div

  return (
    <Wrapper
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.035, 0.3) }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cn(
        'flex w-full items-center gap-4 rounded-[1.5rem] bg-surface p-4 text-left ring-1 ring-hairline shadow-soft',
        onClick && 'press cursor-pointer',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-2xl text-xl',
          entry.is_win ? 'bg-mint-500/15' : 'bg-canvas',
        )}
      >
        {entry.is_win ? '🏆' : '🎲'}
      </span>

      <span className="min-w-0 flex-1">
        <span className="tabular block text-xl font-extrabold tracking-tight text-ink">
          {entry.score}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          {formatTime(entry.played_at)}
          {entry.yahtzee_count > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="font-semibold text-mint-400">
                {entry.yahtzee_count}× Yahtzee
              </span>
            </>
          )}
          {entry.note && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{entry.note}</span>
            </>
          )}
        </span>
      </span>

      {entry.is_win && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint-500/15 px-2.5 py-1 text-[0.7rem] font-bold text-mint-300">
          <Trophy className="size-3" aria-hidden strokeWidth={2.8} />
          Gewonnen
        </span>
      )}
    </Wrapper>
  )
}
