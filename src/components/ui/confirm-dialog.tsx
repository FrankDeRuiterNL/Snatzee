'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from './button'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Bevestigen',
  cancelLabel = 'Annuleren',
  destructive = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void | Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)

  async function handleConfirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

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
                className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] bg-surface-elevated p-6 shadow-float ring-1 ring-hairline-strong focus:outline-none"
              >
                <Dialog.Title className="text-lg font-extrabold tracking-tight text-ink">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-2 text-sm leading-relaxed text-ink-muted">
                    {description}
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">{title}</Dialog.Description>
                )}
                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    variant={destructive ? 'danger' : 'primary'}
                    full
                    loading={busy}
                    onClick={handleConfirm}
                  >
                    {confirmLabel}
                  </Button>
                  <Dialog.Close asChild>
                    <Button variant="ghost" full disabled={busy}>
                      {cancelLabel}
                    </Button>
                  </Dialog.Close>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
