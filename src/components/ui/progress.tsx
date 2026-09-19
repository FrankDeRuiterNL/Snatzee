import { cn } from '@/lib/utils'

export function Progress({
  value,
  max = 100,
  className,
  barClassName,
  label,
}: {
  value: number
  max?: number
  className?: string
  barClassName?: string
  label?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? 'Voortgang'}
      className={cn('h-2.5 w-full overflow-hidden rounded-full bg-white/10', className)}
    >
      <div
        className={cn('h-full rounded-full bg-mint-500 transition-[width] duration-500', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
