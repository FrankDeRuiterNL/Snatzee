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
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy-50 font-bold text-navy-500',
        ring && 'ring-2 ring-white',
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
          unoptimized={src.startsWith('data:')}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
      {!src && <span className="sr-only">{name ?? 'Speler'}</span>}
    </span>
  )
}
