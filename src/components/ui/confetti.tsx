'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'

const COLORS = ['#24C79A', '#FF7A3D', '#A855F7', '#23BBE0', '#E93B7D', '#071E33']

/**
 * Deterministic pseudo-random in [0, 1).
 *
 * Using a hash instead of Math.random keeps the component pure: the same seed
 * always produces the same burst, so server and client render identically and
 * a re-render never reshuffles a burst mid-flight.
 */
function rand(seed: number, salt: number) {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Lightweight DOM confetti — no canvas, no extra dependency. */
export function Confetti({
  pieces = 36,
  seed = 1,
  className,
}: {
  pieces?: number
  /** Vary this per celebration so two bursts do not look identical. */
  seed?: number
  className?: string
}) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => {
        const s = seed + i
        return {
          id: i,
          x: (rand(s, 1) - 0.5) * 320,
          y: 240 + rand(s, 2) * 220,
          rotate: (rand(s, 3) - 0.5) * 720,
          delay: rand(s, 4) * 0.25,
          duration: 1.5 + rand(s, 5) * 0.9,
          color: COLORS[i % COLORS.length]!,
          size: 6 + rand(s, 6) * 7,
          round: rand(s, 7) > 0.55,
        }
      }),
    [pieces, seed],
  )

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden ${className ?? ''}`}
    >
      {bits.map((bit) => (
        <motion.span
          key={bit.id}
          initial={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
          animate={{ opacity: [1, 1, 0], x: bit.x, y: bit.y, rotate: bit.rotate, scale: 0.7 }}
          transition={{ duration: bit.duration, delay: bit.delay, ease: [0.19, 1, 0.22, 1] }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '28%',
            width: bit.size,
            height: bit.round ? bit.size : bit.size * 1.7,
            backgroundColor: bit.color,
            borderRadius: bit.round ? '9999px' : '2px',
          }}
        />
      ))}
    </div>
  )
}
