import Image from 'next/image'
import { cn } from '@/lib/utils'

/** The full Snatzee app icon, straight from the original artwork. */
export function LogoTile({ size = 80, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/logo.png"
      alt="Snatzee"
      width={size}
      height={size}
      priority
      className={cn('rounded-[22%]', className)}
    />
  )
}

/** Dice-only mark, cropped from the same artwork — legible at small sizes. */
export function LogoMark({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/brand/mark.png"
      alt="Snatzee"
      width={size}
      height={size}
      priority
      className={cn('rounded-[24%] shadow-soft', className)}
    />
  )
}

/**
 * Compact lockup for headers: the dice mark next to live text, since the full
 * logo's own wordmark is unreadable at this size.
 */
export function LogoLockup({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image
        src="/brand/mark.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        priority
        className="rounded-[24%] shadow-soft"
      />
      <span className="text-[1.35rem] font-extrabold tracking-tight">
        <span className="text-ink">Snat</span>
        <span className="text-mint-500">zee</span>
      </span>
      <span className="sr-only">Snatzee</span>
    </span>
  )
}
