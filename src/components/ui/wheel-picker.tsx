'use client'

import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

const ITEM_HEIGHT = 44
const VISIBLE_ROWS = 5
const PAD = ((VISIBLE_ROWS - 1) / 2) * ITEM_HEIGHT

/**
 * A single snap-scrolling column, the way a native time picker works.
 *
 * The selected row is whichever one is centred, so the value follows the
 * scroll position rather than needing a tap. Everything is driven by
 * scroll-snap so momentum and rubber-banding stay native.
 */
export function WheelColumn({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: number[]
  value: number
  onChange: (value: number) => void
  label: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Suppresses the scroll handler while we reposition the column ourselves. */
  const programmatic = useRef(false)

  // indexOf is -1 while the value is briefly outside a narrowed list.
  const index = Math.max(0, items.indexOf(value))

  // Follow the value when it changes from outside — for instance when the
  // parent clamps the total to the maximum score.
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const target = index * ITEM_HEIGHT
    if (Math.abs(el.scrollTop - target) < 2) return

    programmatic.current = true
    if (settleTimer.current) clearTimeout(settleTimer.current)
    el.scrollTo({ top: target, behavior: 'auto' })

    const done = setTimeout(() => {
      programmatic.current = false
    }, 140)
    return () => clearTimeout(done)
  }, [index])

  const handleScroll = useCallback(() => {
    if (programmatic.current) return
    const el = ref.current
    if (!el) return

    if (settleTimer.current) clearTimeout(settleTimer.current)

    // Wait for the scroll to settle, then read whichever row landed centre.
    settleTimer.current = setTimeout(() => {
      const landed = Math.round(el.scrollTop / ITEM_HEIGHT)
      const next = items[Math.min(Math.max(landed, 0), items.length - 1)]
      if (next !== undefined && next !== value) {
        haptic('light')
        onChange(next)
      }
    }, 90)
  }, [items, onChange, value])

  function handleKeyDown(event: React.KeyboardEvent) {
    const delta =
      event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (delta === 0) return
    event.preventDefault()

    const next = items[Math.min(Math.max(index + delta, 0), items.length - 1)]
    if (next !== undefined && next !== value) onChange(next)
  }

  return (
    <div
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={items[0]}
      aria-valuemax={items[items.length - 1]}
      aria-valuetext={String(value)}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className={cn(
        'no-scrollbar relative snap-y snap-mandatory overflow-y-scroll overscroll-contain',
        'rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-mint-400',
        className,
      )}
      // No scroll-padding: the spacer divs already centre the rows, and a
      // scroll-padding would shift every snap point by one row.
      style={{ height: VISIBLE_ROWS * ITEM_HEIGHT }}
    >
      <div style={{ paddingTop: PAD, paddingBottom: PAD }}>
        {items.map((item) => {
          const distance = Math.abs(item - value)
          return (
            <div
              key={item}
              className={cn(
                'tabular flex snap-center items-center justify-center font-black tabular-nums transition-all duration-150',
                distance === 0
                  ? 'text-3xl text-ink'
                  : distance === 1
                    ? 'text-2xl text-ink-soft/70'
                    : 'text-xl text-ink-muted/40',
              )}
              style={{ height: ITEM_HEIGHT }}
            >
              {item}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export { ITEM_HEIGHT, VISIBLE_ROWS }
