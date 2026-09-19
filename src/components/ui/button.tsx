'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Every variant clears the 44px touch-target floor.
  'press relative inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold tracking-tight disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-mint-500 text-navy-950 glow-mint hover:bg-mint-400',
        navy: 'bg-surface-elevated text-white shadow-soft hover:bg-surface-high',
        soft: 'bg-surface text-ink ring-1 ring-hairline shadow-soft hover:bg-canvas-soft',
        ghost: 'bg-transparent text-ink-soft hover:bg-white/5',
        outline: 'bg-transparent text-ink ring-1 ring-hairline hover:bg-surface',
        danger: 'bg-rose-ember-500 text-white shadow-soft hover:brightness-110',
        dangerSoft: 'bg-rose-ember-500/15 text-rose-ember-300 ring-1 ring-rose-ember-500/25 hover:bg-rose-ember-500/25',
      },
      size: {
        sm: 'min-h-11 px-4 text-sm',
        md: 'min-h-12 px-5 text-[0.95rem]',
        lg: 'min-h-14 px-6 text-base',
        icon: 'size-11 rounded-full p-0',
        iconLg: 'size-14 rounded-full p-0',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, full, asChild, loading, children, disabled, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, full }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span className="sr-only">Bezig…</span>
          <span aria-hidden className="contents">
            {children}
          </span>
        </>
      ) : (
        children
      )}
    </Comp>
  )
})

export { buttonVariants }
