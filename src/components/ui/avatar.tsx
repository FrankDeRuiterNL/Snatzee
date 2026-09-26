'use client'

import Image from 'next/image'
import { cn, initials } from '@/lib/utils'

const SIZES = {
  xs: 'size-8 text-[0.65rem]',
  sm: 'size-10 text-xs',
  md: 'size-12 text-sm',
  lg: 'size-16 text-base',
  xl: 'size-24 text-xl',
} as const

export function Avatar({
  src,
  name,
  size = 'md',
  className,
  ring = true,
}: {
  src?: string | null
  name?: string | null
  size?: keyof typeof SIZES
  className?: string
  ring?: boolean
}) {
  const px = { xs: 32, sm: 40, md: 48, lg: 64, xl: 96 }[size]

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-high font-bold text-ink-soft',
        ring && 'ring-2 ring-white/10',
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={name ? `Profielfoto van ${name}` : 'Profielfoto'}
          width={px}
          height={px}
          className="size-full object-cover"
          // Loaded by the browser straight from storage, never through the
          // image optimiser. Avatars are already 384px and a few tens of
          // KB when uploaded (lib/image.ts), so there is little to gain —
          // and the optimiser fetches the public URL from inside the app
          // container, which on a home server behind NAT often cannot
          // reach its own public address: every avatar then broke as soon
          // as the optimiser's cache was emptied by a rebuild.
          unoptimized
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      {!src && <span className="sr-only">{name ?? 'Speler'}</span>}
    </span>
  )
}
