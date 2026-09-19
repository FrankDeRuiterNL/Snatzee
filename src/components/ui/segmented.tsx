'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

export interface SegmentOption<T extends string> {
  key: T
  label: string
  disabled?: boolean
}

/** Pill selector with a sliding indicator — used for scopes and filters. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  layoutId,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  layoutId?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-1 rounded-full bg-surface p-1 ring-1 ring-hairline', className)}
    >
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => {
              haptic('light')
              onChange(option.key)
            }}
            className={cn(
              'press relative min-h-11 flex-1 rounded-full px-3 text-sm font-semibold transition-colors disabled:opacity-40',
              active ? 'text-white' : 'text-ink-soft',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId ?? `segmented-${ariaLabel}`}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                className="absolute inset-0 rounded-full bg-surface-elevated"
                aria-hidden
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Horizontally scrollable chips for longer option lists. */
export function ChipScroller<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('scroll-x no-scrollbar -mx-5 flex gap-2 px-5', className)}
    >
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => {
              haptic('light')
              onChange(option.key)
            }}
            className={cn(
              'press min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors',
              active
                ? 'bg-surface-elevated text-white shadow-soft'
                : 'bg-surface text-ink-soft ring-1 ring-hairline',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
