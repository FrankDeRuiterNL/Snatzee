import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCENTS = {
  mint: 'bg-mint-100 text-mint-700',
  navy: 'bg-navy-50 text-navy-700',
  tangerine: 'bg-tangerine-100 text-tangerine-600',
  grape: 'bg-grape-100 text-grape-600',
  aqua: 'bg-aqua-100 text-aqua-500',
  rose: 'bg-rose-ember-100 text-rose-ember-500',
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
        'rounded-[1.5rem] bg-white p-4 ring-1 ring-navy-100/70 shadow-soft',
        className,
      )}
    >
      {Icon && (
        <span className={cn('mb-3 grid size-9 place-items-center rounded-xl', ACCENTS[accent])}>
          <Icon className="size-4.5" aria-hidden strokeWidth={2.4} />
        </span>
      )}
      <p className="text-sm font-medium text-navy-300">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-extrabold tracking-tight text-navy-900">{value}</p>
      {hint && <p className="mt-1 text-xs font-medium text-navy-300">{hint}</p>}
    </div>
  )
}
