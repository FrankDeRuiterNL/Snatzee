'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Confirmation before a first-roll Yahtzee is written.
 *
 * The button sits on the home screen and is easy to hit by accident, and a
 * first-roll Yahtzee is rare enough that a stray tap would visibly distort
 * someone's record. Nothing is saved until "Ja!" is pressed.
 */
export function FirstRollDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  pending: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={pending ? () => {} : onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[55] bg-black/75 backdrop-blur-sm"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="fixed left-1/2 top-1/2 z-[56] w-[min(24rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] bg-surface-elevated p-6 text-center shadow-float ring-1 ring-hairline-strong focus:outline-none"
              >
                <motion.span
                  aria-hidden
                  initial={{ rotate: -12, scale: 0.7 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 260 }}
                  className="mx-auto grid size-16 place-items-center rounded-2xl bg-tangerine-500/15 text-3xl ring-1 ring-tangerine-500/30"
                >
                  🎲
                </motion.span>

                <Dialog.Title className="mt-5 text-xl font-black tracking-tight text-ink">
                  Yahtzee in 1 worp?
                </Dialog.Title>
                <Dialog.Description className="mx-auto mt-2 max-w-[26ch] text-[0.95rem] leading-relaxed text-ink-soft">
                  Heb je in 1 worp Yahtzee gegooid?
                </Dialog.Description>

                <div className="mt-7 flex gap-2">
                  <Dialog.Close asChild>
                    <Button variant="soft" size="lg" className="flex-1" disabled={pending}>
                      Nee
                    </Button>
                  </Dialog.Close>
                  <Button
                    size="lg"
                    className="flex-1"
                    loading={pending}
                    disabled={pending}
                    onClick={onConfirm}
                  >
                    Ja!
                    <Zap className="size-5" aria-hidden strokeWidth={2.8} />
                  </Button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
