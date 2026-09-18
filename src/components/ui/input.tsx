'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'min-h-12 w-full rounded-2xl bg-cream-100 px-4 text-navy-900 ring-1 ring-navy-100 transition',
          'placeholder:text-navy-300 focus:bg-white focus:ring-2 focus:ring-mint-500 focus:outline-none',
          'disabled:opacity-60',
          className,
        )}
        {...props}
      />
    )
  },
)

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-24 w-full resize-none rounded-2xl bg-cream-100 px-4 py-3 text-navy-900 ring-1 ring-navy-100 transition',
        'placeholder:text-navy-300 focus:bg-white focus:ring-2 focus:ring-mint-500 focus:outline-none',
        className,
      )}
      {...props}
    />
  )
})

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-2 block text-sm font-semibold text-navy-500', className)}
      {...props}
    />
  )
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="mt-2 text-sm font-medium text-rose-ember-500">
      {children}
    </p>
  )
}
