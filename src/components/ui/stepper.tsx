'use client'

import { Minus, Plus } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

/**
 * Number stepper for small counts. Deliberately large targets: this is used
 * one-handed, straight after a game.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  className,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label: string
  className?: string
}) {
  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(min, next))
    if (clamped === value) return
    haptic('light')
    onChange(clamped)
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-2xl bg-canvas p-2 ring-1 ring-hairline',
        className,
      )}
    >
      <StepButton
        onClick={() => set(value - 1)}
        disabled={value <= min}
        label={`${label} verlagen`}
      >
        <Minus className="size-5" aria-hidden strokeWidth={2.8} />
      </StepButton>

      <div
        role="status"
        aria-live="polite"
        aria-label={`${label}: ${value}`}
        className="relative min-w-16 text-center"
      >
        <motion.span
          key={value}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 18, stiffness: 400 }}
          className="tabular block text-3xl font-black tracking-tight text-ink"
        >
          {value}
        </motion.span>
      </div>

      <StepButton
        onClick={() => set(value + 1)}
        disabled={value >= max}
        label={`${label} verhogen`}
      >
        <Plus className="size-5" aria-hidden strokeWidth={2.8} />
      </StepButton>
    </div>
  )
}

function StepButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'press grid size-12 shrink-0 place-items-center rounded-xl transition-colors',
        disabled
          ? 'bg-white/5 text-ink-muted/50'
          : 'bg-surface-elevated text-mint-400 ring-1 ring-hairline-strong hover:bg-surface-high',
      )}
    >
      {children}
    </button>
  )
}
