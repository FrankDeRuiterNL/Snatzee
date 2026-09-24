'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogoLockup } from '@/components/ui/logo'
import { getLaunchSoundState, subscribeLaunchSound } from '@/lib/audio'

/**
 * Tap-to-start screen, so the audio logo lands at launch.
 *
 * No browser plays audible sound before the page has been interacted
 * with, and opening an app from the homescreen is not an interaction with
 * the page — the tap happened on an icon in another process. This turns
 * the launch itself into that interaction.
 *
 * It only appears when it would actually change something: the cue has
 * been refused and is sitting waiting for a gesture. If autoplay worked
 * (Android, desktop), if sound is off, or if the cue already played this
 * session, nothing is shown.
 *
 * The tap does not play the sound itself. playLaunchSound() already has
 * capture-phase listeners waiting for the first gesture anywhere, and
 * they fire on this one like any other — so there is one code path for
 * the cue, the one that is tested.
 */

/** Long enough to notice, short enough not to be a wall. */
const AUTO_DISMISS_MS = 4_000

export function LaunchSplash() {
  // The cue's state lives outside React, so it is read the way external
  // stores are meant to be read. The server snapshot is 'idle', which
  // renders nothing and so matches the first client paint.
  const state = useSyncExternalStore(subscribeLaunchSound, getLaunchSoundState, () => 'idle' as const)
  const [dismissed, setDismissed] = useState(false)

  const visible = state === 'waiting' && !dismissed

  useEffect(() => {
    if (!visible) return
    // Ignoring it costs the sound, not the app.
    const timer = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [visible])

  const dismiss = useCallback(() => setDismissed(true), [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          // The whole surface dismisses, not just the button: the button
          // says where to tap, it is not a target you have to hit.
          onClick={dismiss}
          role="button"
          tabIndex={0}
          aria-label="Tik om te beginnen"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') dismiss()
          }}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-10 bg-canvas px-8"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.94, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
          >
            <LogoLockup size={72} />
          </motion.div>

          <span className="press rounded-full bg-mint-500 px-8 py-4 text-lg font-black tracking-tight text-navy-950 glow-mint">
            Tijd voor Snatzee!
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
