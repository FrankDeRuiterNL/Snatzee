import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-shimmer rounded-2xl bg-white/6', className)}
    />
  )
}

export function CardSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-28 rounded-[1.75rem]', className)} />
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Laden" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[4.5rem] rounded-[1.5rem]" />
      ))}
    </div>
  )
}
