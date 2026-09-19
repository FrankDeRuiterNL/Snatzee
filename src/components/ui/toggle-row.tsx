'use client'

import * as Switch from '@radix-ui/react-switch'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex min-h-14 items-center justify-between gap-4', className)}>
      <span className="min-w-0">
        <span className="block text-[0.95rem] font-semibold text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-muted">{description}</span>}
      </span>
      <Switch.Root
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          haptic('light')
          onCheckedChange(next)
        }}
        aria-label={label}
        className={cn(
          'relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-mint-500' : 'bg-white/10',
        )}
      >
        <Switch.Thumb className="block size-6 translate-x-1 rounded-full bg-surface shadow-soft transition-transform data-[state=checked]:translate-x-7" />
      </Switch.Root>
    </div>
  )
}
