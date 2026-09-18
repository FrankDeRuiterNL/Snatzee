import { Skeleton } from '@/components/ui/skeleton'

export default function AppLoading() {
  return (
    <div
      className="space-y-6"
      role="status"
      aria-label="Bezig met laden"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
    >
      <div className="flex items-center gap-3 px-5 pb-1">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-24" />
        </div>
        <Skeleton className="size-11 rounded-full" />
      </div>

      <Skeleton className="mx-5 h-56 rounded-[1.75rem]" />

      <div className="space-y-3 px-5">
        <Skeleton className="h-16 rounded-[1.5rem]" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-[4.5rem] rounded-[1.5rem]" />
          <Skeleton className="h-[4.5rem] rounded-[1.5rem]" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-[1.5rem]" />
        ))}
      </div>
    </div>
  )
}
