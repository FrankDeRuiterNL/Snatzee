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
        tone === 'light' && 'bg-white ring-1 ring-navy-100/70 shadow-soft',
        tone === 'navy' && 'bg-navy-900 text-white shadow-lift',
        tone === 'mint' && 'bg-mint-500 text-navy-950 shadow-lift',
        tone === 'plain' && 'bg-cream-50 ring-1 ring-navy-100/60',
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
  return <p className={cn('text-sm text-navy-300', className)} {...props} />
}
