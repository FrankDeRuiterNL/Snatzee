import { cn, pluralize } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'
import type { UserStatistics } from '@/types/database'

/** Compact level chip — used next to a name in headers and lists. */
export function LevelChip({
  emoji,
  name,
  className,
  tone = 'light',
}: {
  emoji: string | null
  name: string | null
  className?: string
  tone?: 'light' | 'dark'
}) {
  if (!name) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
        tone === 'dark' ? 'bg-white/10 text-white' : 'bg-cream-100 text-navy-500',
        className,
      )}
    >
      <span aria-hidden>{emoji ?? '🎲'}</span>
      {name}
    </span>
  )
}

/**
 * Level with progress to the next one. Shows how many games are left, which
 * is the part people actually act on.
 */
export function LevelCard({ stats }: { stats: UserStatistics }) {
  if (!stats.level_name) return null

  const from = stats.level_min_games ?? 0
  const to = stats.next_level_min_games
  const played = stats.games_played
  const remaining = stats.games_to_next_level

  // Progress within the current band, not against the whole ladder.
  const span = to === null ? 0 : to - from
  const done = to === null ? 0 : played - from

  return (
    <section
      aria-labelledby="level-heading"
      className="mx-5 rounded-[1.75rem] bg-white p-5 ring-1 ring-navy-100/70 shadow-soft"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-14 shrink-0 place-items-center rounded-2xl bg-cream-100 text-3xl"
        >
          {stats.level_emoji ?? '🎲'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-300">Jouw niveau</p>
          <h2
            id="level-heading"
            className="truncate text-lg font-extrabold tracking-tight text-navy-900"
          >
            {stats.level_name}
          </h2>
        </div>
      </div>

      {to === null || remaining === null ? (
        <p className="mt-4 text-sm font-medium text-mint-700">
          Hoogste niveau bereikt — petje af. 🎉
        </p>
      ) : (
        <>
          <Progress
            value={done}
            max={span}
            label={`Voortgang naar ${stats.next_level_name}`}
            className="mt-4"
          />
          <p className="mt-2.5 text-sm text-navy-300">
            Nog{' '}
            <strong className="font-bold text-navy-900">
              {remaining} {pluralize(remaining, 'potje', 'potjes')}
            </strong>{' '}
            tot {stats.next_level_emoji} {stats.next_level_name}
          </p>
        </>
      )}
    </section>
  )
}
