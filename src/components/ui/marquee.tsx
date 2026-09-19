'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shows text in full by sliding it, instead of cutting it off with an
 * ellipsis.
 *
 * It only moves when the text genuinely does not fit: a name that already
 * fits is rendered normally, because a heading that drifts for no reason
 * is just noise. The animation runs in CSS off two custom properties, so
 * nothing is measured or stepped per frame.
 *
 * The movement is a there-and-back rather than a loop — for a single name
 * the reader wants the end and then the start again, not an endless belt.
 */

/** Pixels per second — an unhurried reading pace. */
const SPEED = 45
/** A short name should not snap across; a very long one should not take all day. */
const MIN_DURATION = 4
const MAX_DURATION = 14
/** Anything under this is a rounding artefact, not real overflow. */
const OVERFLOW_THRESHOLD = 4

export function Marquee({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [distance, setDistance] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = () => {
      // Someone who has asked for less motion gets the ellipsis instead.
      // Both the OS setting and the app's own toggle count.
      const reduced =
        window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        document.documentElement.classList.contains('motion-reduce')

      if (reduced) {
        setDistance(0)
        return
      }

      // Measured on the container, not the text: an inline element reports
      // scrollWidth 0 in Chrome, so asking the text how wide it is returns
      // nothing until it has already been given the inline-block track —
      // which it never would be, because the measurement said it fits.
      // The container clips the overflow, so its own scrollWidth carries it.
      const overflow = container.scrollWidth - container.clientWidth
      setDistance(overflow > OVERFLOW_THRESHOLD ? overflow : 0)
    }

    // Measured after paint, when the font has been applied and the box has
    // its final width.
    const frame = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(container)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [text])

  const scrolling = distance > 0

  return (
    <span
      ref={containerRef}
      // The full text is in the DOM either way, so screen readers and
      // desktop hover both get all of it.
      title={text}
      className={cn('block overflow-hidden whitespace-nowrap', !scrolling && 'text-ellipsis', className)}
    >
      <span
        ref={textRef}
        className={scrolling ? 'marquee-track' : undefined}
        style={
          scrolling
            ? ({
                '--marquee-distance': `${distance}px`,
                '--marquee-duration': `${Math.min(
                  MAX_DURATION,
                  Math.max(MIN_DURATION, distance / SPEED),
                ).toFixed(2)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </span>
  )
}
