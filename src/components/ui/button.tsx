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
        primary: 'bg-mint-500 text-navy-950 shadow-soft hover:bg-mint-400',
        navy: 'bg-navy-900 text-white shadow-soft hover:bg-navy-800',
        soft: 'bg-white text-navy-900 ring-1 ring-navy-100 shadow-soft hover:bg-cream-50',
        ghost: 'bg-transparent text-navy-500 hover:bg-navy-50',
        outline: 'bg-transparent text-navy-900 ring-1 ring-navy-100 hover:bg-white',
        danger: 'bg-rose-ember-500 text-white shadow-soft hover:brightness-110',
        dangerSoft: 'bg-rose-ember-100 text-rose-ember-500 hover:brightness-95',
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
