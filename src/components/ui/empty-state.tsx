import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  emoji = '🎲',
  title,
  description,
  action,
  className,
}: {
  emoji?: string
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-[1.75rem] bg-white px-6 py-10 text-center ring-1 ring-navy-100/70 shadow-soft',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-16 place-items-center rounded-3xl bg-cream-100 text-3xl"
      >
        {emoji}
      </span>
      <h3 className="mt-4 text-lg font-extrabold tracking-tight text-navy-900">{title}</h3>
      {description && (
        <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-navy-300">{description}</p>
      )}
      {action && <div className="mt-6 w-full max-w-64">{action}</div>}
    </div>
  )
}
