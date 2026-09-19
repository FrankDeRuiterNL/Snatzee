import * as React from 'react'
import { cn } from '@/lib/utils'

/** The app's signature surface: large radius, hairline border, soft lift. */
export function Card({
  className,
  tone = 'light',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: 'light' | 'navy' | 'mint' | 'plain' }) {
  return (
    <div
      className={cn(
        'rounded-[1.75rem] p-5',
        tone === 'light' && 'card-surface',
        tone === 'navy' && 'card-elevated sheen text-ink',
        tone === 'mint' && 'bg-mint-500 text-navy-950 shadow-lift',
        tone === 'plain' && 'bg-canvas-soft ring-1 ring-hairline',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-bold tracking-tight', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-ink-muted', className)} {...props} />
}
