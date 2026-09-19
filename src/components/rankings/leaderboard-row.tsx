'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Crown } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { cn, formatNumber } from '@/lib/utils'
import type { LeaderboardRow as Row } from '@/types/database'

const MEDALS: Record<number, string> = {
  1: 'bg-tangerine-500/15 text-tangerine-300',
  2: 'bg-white/8 text-ink-soft',
  3: 'bg-grape-500/15 text-grape-300',
}

export function LeaderboardRow({
  row,
  decimals = 0,
  index = 0,
  sticky = false,
}: {
  row: Row
  decimals?: number
  index?: number
  sticky?: boolean
}) {
  return (
    <motion.div
      initial={sticky ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.3) }}
    >
      <Link
        href={`/u/${row.username}`}
        className={cn(
          'press flex items-center gap-3 rounded-[1.5rem] p-3 pr-4 ring-1 transition-colors',
          row.is_current_user
            ? 'bg-surface-elevated text-white ring-hairline-strong shadow-lift'
            : 'bg-surface ring-hairline shadow-soft',
        )}
      >
        <span
          className={cn(
            'tabular grid size-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold',
            row.is_current_user
              ? 'bg-surface/10 text-white'
              : (MEDALS[row.rank] ?? 'bg-canvas text-ink-muted'),
          )}
        >
          {row.rank}
        </span>

        <span className="relative shrink-0">
          <Avatar src={row.avatar_url} name={row.display_name} size="sm" />
          {row.rank === 1 && (
            <Crown
              className="absolute -right-1 -top-2 size-4 rotate-12 text-tangerine-400"
              aria-label="Eerste plaats"
              strokeWidth={2.6}
            />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate font-bold tracking-tight',
              row.is_current_user ? 'text-white' : 'text-ink',
            )}
          >
            {row.display_name}
            {row.is_current_user && (
              <span className="ml-1.5 text-xs font-semibold text-mint-400">jij</span>
            )}
          </span>
          <span
            className={cn(
              'block truncate text-xs',
              row.is_current_user ? 'text-ink-muted' : 'text-ink-muted',
            )}
          >
            @{row.username}
          </span>
        </span>

        <span
          className={cn(
            'tabular shrink-0 text-lg font-extrabold tracking-tight',
            row.is_current_user ? 'text-mint-400' : 'text-ink',
          )}
        >
          {formatNumber(row.value, decimals)}
        </span>
      </Link>
    </motion.div>
  )
}
