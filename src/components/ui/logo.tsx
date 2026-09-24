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

/**
 * Stacked lockup: the mark with the wordmark beneath it.
 *
 * For the launch screen, where the logo is the whole composition rather
 * than something sitting in a header — so it reads centred rather than
 * running off to one side, and the wordmark can carry more weight than
 * the compact horizontal version allows.
 */
/**
 * The wordmark and the gap, as fractions of the mark's size.
 *
 * Derived from the proportions the stack was designed at (a 101px mark
 * over a 1.755rem wordmark, 12px apart), so passing a different size
 * scales the whole lockup rather than stretching one part of it.
 */
const WORDMARK_RATIO = 28.08 / 101
const GAP_RATIO = 12 / 101

export function LogoStack({ size = 101, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex flex-col items-center', className)}
      style={{ gap: `${size * GAP_RATIO}px` }}
    >
      <Image
        src="/brand/mark.png"
        alt=""
        aria-hidden
        width={size}
        height={size}
        priority
        className="rounded-[24%] shadow-soft"
      />
      <span
        className="font-extrabold tracking-tight"
        style={{ fontSize: `${size * WORDMARK_RATIO}px` }}
      >
        <span className="text-ink">Snat</span>
        <span className="text-mint-500">zee</span>
      </span>
      <span className="sr-only">Snatzee</span>
    </span>
  )
}
