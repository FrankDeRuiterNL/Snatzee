import { ListSkeleton, Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div
      className="space-y-5"
      role="status"
      aria-label="Bezig met laden"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
    >
      <div className="space-y-2 px-5 pb-1">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mx-5 h-12 rounded-full" />
      <div className="px-5">
        <ListSkeleton rows={6} />
      </div>
    </div>
  )
}
