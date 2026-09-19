import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCENTS = {
  mint: 'bg-mint-500/15 text-mint-300',
  navy: 'bg-white/8 text-ink-soft',
  tangerine: 'bg-tangerine-500/15 text-tangerine-300',
  grape: 'bg-grape-500/15 text-grape-300',
  aqua: 'bg-aqua-500/15 text-aqua-300',
  rose: 'bg-rose-ember-500/15 text-rose-ember-300',
} as const

export type StatAccent = keyof typeof ACCENTS

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = 'navy',
  className,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  accent?: StatAccent
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[1.5rem] bg-surface p-4 ring-1 ring-hairline shadow-soft',
        className,
      )}
    >
      {Icon && (
        <span className={cn('mb-3 grid size-9 place-items-center rounded-xl', ACCENTS[accent])}>
          <Icon className="size-4.5" aria-hidden strokeWidth={2.4} />
        </span>
      )}
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs font-medium text-ink-muted">{hint}</p>}
    </div>
  )
}
