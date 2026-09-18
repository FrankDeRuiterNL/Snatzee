'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet that behaves like a native modal: it springs up from the
 * bottom edge, respects the home-indicator inset and can be swiped away.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  showClose = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  showClose?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-navy-950/40 backdrop-blur-[2px]"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 32, stiffness: 340 }}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 120 || info.velocity.y > 600) onOpenChange(false)
                }}
                className={cn(
                  'fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[34rem] flex-col',
                  'rounded-t-[2rem] bg-cream-100 shadow-float focus:outline-none',
                  className,
                )}
              >
                <div className="flex justify-center pt-3 pb-1">
                  <span aria-hidden className="h-1.5 w-11 rounded-full bg-navy-100" />
                </div>

                <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-4">
                  <div className="min-w-0">
                    <Dialog.Title className="text-xl font-extrabold tracking-tight text-navy-900">
                      {title}
                    </Dialog.Title>
                    {description ? (
                      <Dialog.Description className="mt-1 text-sm text-navy-300">
                        {description}
                      </Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}
                  </div>
                  {showClose && (
                    <Dialog.Close
                      aria-label="Sluiten"
                      className="press grid size-11 shrink-0 place-items-center rounded-full bg-white text-navy-500 ring-1 ring-navy-100"
                    >
                      <X className="size-5" aria-hidden />
                    </Dialog.Close>
                  )}
                </div>

                <div className="scroll-x flex-1 overflow-y-auto overscroll-contain px-5">
                  {children}
                </div>

                <div
                  className="px-5 pt-4"
                  style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
                >
                  {footer}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
