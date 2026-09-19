'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Download, Share, SquarePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { haptic } from '@/lib/haptics'
import {
  getInstallPlatform,
  isStandalone,
  promptInstall,
  subscribeToInstallState,
} from '@/lib/pwa'
import { enablePush, getNotificationPermission, isPushSupported, refreshPushSubscription } from '@/lib/push'

/**
 * The two nudges an installed app needs, and the honest limits behind them.
 *
 * In a browser tab: a card inviting the person to add Snatzee to their
 * homescreen. It shows for a minute and then gets out of the way — the whole
 * point is that it is a hint, not a wall. On Chromium the button really does
 * install the app, because the browser handed over a `beforeinstallprompt`
 * event we can replay. On iOS there is no such API at any version: Apple only
 * allows installing through the Share sheet, so the button opens the share
 * sheet where that is possible and otherwise shows exactly where to tap.
 *
 * In the installed app: a card asking to turn on notifications, because push
 * on iOS only exists once the app is on the homescreen. The permission sheet
 * cannot be raised on its own either — every browser requires the request to
 * come from a tap — so this puts a single button in front of the person on
 * the first launch after installing, which is as automatic as the platform
 * allows.
 */

const INSTALL_DISMISSED_KEY = 'snatzee:install-dismissed-at'
const PUSH_ASKED_KEY = 'snatzee:push-asked'

/** How long the install card stays on screen. */
const INSTALL_VISIBLE_MS = 60_000
/** Let the app paint before anything slides in. */
const APPEAR_DELAY_MS = 1_500
/** Once dismissed, stay quiet for a week. */
const DISMISS_QUIET_MS = 7 * 24 * 60 * 60 * 1000

type Mode = 'idle' | 'install' | 'notifications'

function readTimestamp(key: string) {
  try {
    const stored = window.localStorage.getItem(key)
    return stored ? Number(stored) : 0
  } catch {
    return 0
  }
}

function writeTimestamp(key: string) {
  try {
    window.localStorage.setItem(key, String(Date.now()))
  } catch {
    // Blocked storage just means the card may come back later.
  }
}

export function PwaPrompts() {
  const [mode, setMode] = useState<Mode>('idle')
  const [iosHelpOpen, setIosHelpOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const decide = useCallback(() => {
    const standalone = isStandalone()

    if (standalone) {
      // Installed: the only thing still missing is permission.
      if (
        isPushSupported() &&
        getNotificationPermission() === 'default' &&
        readTimestamp(PUSH_ASKED_KEY) === 0
      ) {
        setMode('notifications')
        return
      }
      setMode('idle')
      return
    }

    if (Date.now() - readTimestamp(INSTALL_DISMISSED_KEY) < DISMISS_QUIET_MS) {
      setMode('idle')
      return
    }

    // A browser that offers neither a real install prompt nor the iOS share
    // route has nothing to install with, so the card would be a dead end.
    // Chromium can still deliver the event later; that re-runs this.
    if (getInstallPlatform() === 'unsupported') {
      setMode('idle')
      return
    }

    setMode('install')
  }, [])

  useEffect(() => {
    // A subscription whose endpoint the browser rotated is re-registered
    // here, quietly, without asking for anything.
    void refreshPushSubscription()

    const appear = window.setTimeout(decide, APPEAR_DELAY_MS)
    // Chromium may deliver `beforeinstallprompt` after the card was decided;
    // re-deciding upgrades the iOS-style hint into a real install button.
    const unsubscribe = subscribeToInstallState(decide)

    return () => {
      window.clearTimeout(appear)
      unsubscribe()
    }
  }, [decide])

  useEffect(() => {
    if (mode !== 'install') return
    const hide = window.setTimeout(() => setMode('idle'), INSTALL_VISIBLE_MS)
    return () => window.clearTimeout(hide)
  }, [mode])

  const dismissInstall = useCallback(() => {
    haptic('light')
    writeTimestamp(INSTALL_DISMISSED_KEY)
    setMode('idle')
  }, [])

  const dismissNotifications = useCallback(() => {
    haptic('light')
    writeTimestamp(PUSH_ASKED_KEY)
    setMode('idle')
  }, [])

  const install = useCallback(async () => {
    haptic('light')

    if (getInstallPlatform() === 'prompt') {
      setBusy(true)
      const accepted = await promptInstall()
      setBusy(false)
      if (accepted) {
        writeTimestamp(INSTALL_DISMISSED_KEY)
        setMode('idle')
        toast.success('Snatzee wordt toegevoegd ✓')
      }
      return
    }

    // iOS: the share sheet is the only route, and it cannot be opened
    // programmatically either — so show where it is.
    setIosHelpOpen(true)
  }, [])

  const allowNotifications = useCallback(async () => {
    haptic('light')
    setBusy(true)
    const result = await enablePush()
    setBusy(false)
    writeTimestamp(PUSH_ASKED_KEY)

    if (result.ok) {
      toast.success('Meldingen staan aan 🔔')
      setMode('idle')
      return
    }

    if (result.reason === 'denied') {
      toast.error('Meldingen zijn geblokkeerd. Zet ze aan in je apparaatinstellingen.')
    } else if (result.reason === 'unsupported') {
      toast.error('Dit toestel ondersteunt geen meldingen.')
    } else {
      toast.error('Meldingen aanzetten is niet gelukt.')
    }
    setMode('idle')
  }, [])

  return (
    <AnimatePresence>
      {mode !== 'idle' && (
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-nav safe-x"
        >
          <div
            role="dialog"
            aria-label={mode === 'install' ? 'Snatzee installeren' : 'Meldingen aanzetten'}
            className="card-elevated pointer-events-auto w-full max-w-[32rem] rounded-3xl p-4 shadow-float"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mint-500/15 text-mint-400">
                {mode === 'install' ? (
                  <Download className="size-5" aria-hidden />
                ) : (
                  <Bell className="size-5" aria-hidden />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-[0.95rem] font-bold text-ink">
                  {mode === 'install'
                    ? 'Zet Snatzee op je beginscherm'
                    : 'Meldingen aanzetten'}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {mode === 'install'
                    ? 'Dan opent Snatzee als een echte app, werkt het offline en kun je meldingen ontvangen.'
                    : 'Krijg een seintje bij vriendschapsverzoeken, verbroken records en nieuwe achievements.'}
                </p>

                {mode === 'install' && iosHelpOpen && (
                  <ol className="mt-3 space-y-2 rounded-2xl bg-canvas p-3 text-sm text-ink-soft">
                    <li className="flex items-center gap-2">
                      <Share className="size-4 shrink-0 text-mint-400" aria-hidden />
                      Tik onderin op het deel-icoon
                    </li>
                    <li className="flex items-center gap-2">
                      <SquarePlus className="size-4 shrink-0 text-mint-400" aria-hidden />
                      Kies &ldquo;Zet op beginscherm&rdquo;
                    </li>
                  </ol>
                )}

                <div className="mt-3 flex gap-2">
                  {mode === 'install' ? (
                    <Button size="sm" loading={busy} onClick={install}>
                      {getInstallPlatform() === 'prompt' ? 'Toevoegen' : 'Laat zien hoe'}
                    </Button>
                  ) : (
                    <Button size="sm" loading={busy} onClick={allowNotifications}>
                      Zet aan
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={mode === 'install' ? dismissInstall : dismissNotifications}
                  >
                    Niet nu
                  </Button>
                </div>
              </div>

              <button
                type="button"
                aria-label="Sluiten"
                onClick={mode === 'install' ? dismissInstall : dismissNotifications}
                className="press -mr-1 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-white/5"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
