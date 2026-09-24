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

/**
 * Keeps the button exactly where the centred layout used to put it.
 *
 * That layout stacked a 72px logo, a 40px gap and the button, centred as
 * one group. The logo is now bigger and sits higher, but the button
 * should not move — so the region above it keeps the height the logo and
 * gap used to contribute, and grows by the same share as the space below.
 * Doing it with flex rather than a calc() means the safe-area padding on
 * the container is accounted for automatically.
 */
const RESERVED_ABOVE_BUTTON = 112

/**
 * Runs before the first paint, so the screen is either there immediately
 * or never drawn at all.
 *
 * Rendering the overlay only once React knew the cue was blocked meant
 * waiting for hydration, a fetch and a decode — long enough to see the
 * app first and the screen a moment later. It is server-rendered now, and
 * this hides it up front in the cases that can be known synchronously:
 * sound off, the cue already played this session, or a platform that
 * autoplayed last time and so will not need a tap.
 */
const SUPPRESS_SCRIPT = `(function(){try{
var off=localStorage.getItem('snatzee:sound')==='false'
||sessionStorage.getItem('snatzee:logo-played')==='true'
||localStorage.getItem('snatzee:launch-autoplay')==='true';
if(off)document.documentElement.dataset.splash='off';
}catch(e){}})()`

/**
 * Emitted by the server so the markup below is hidden before it paints.
 * Inert once the app is running; the component takes over from there.
 */
export function LaunchSplashSuppressor() {
  return <script dangerouslySetInnerHTML={{ __html: SUPPRESS_SCRIPT }} />
}

export function LaunchSplash() {
  // The cue's state lives outside React, so it is read the way external
  // stores are meant to be read. The server snapshot is 'idle' and the
  // overlay is drawn in that state, which is what puts it in the very
  // first paint; it is taken away again as soon as the cue reports it has
  // nothing pending.
  const state = useSyncExternalStore(subscribeLaunchSound, getLaunchSoundState, () => 'idle' as const)
  const [dismissed, setDismissed] = useState(false)

  const visible = state !== 'done' && !dismissed

  useEffect(() => {
    if (!visible) return
    // Ignoring it costs the sound, not the app.
    const timer = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [visible])

  const dismiss = useCallback(() => setDismissed(true), [])

  /*
   * `initial={false}` on both, and no entrance animation at all.
   *
   * framer-motion writes an element's `initial` into the server markup,
   * so `initial={{ opacity: 0 }}` shipped this overlay as opacity:0. It
   * only became visible once framer had hydrated and animated it in --
   * precisely the window in which the app showed through. A launch
   * screen has to be opaque in the very first frame; only the way out
   * is animated.
   */
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          // No `initial` and no `animate`: any entrance transition makes
          // framer take the opacity under 1 for a frame or two just as
          // the app is being revealed behind it. Only the exit animates.
          initial={false}
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
          id="launch-splash"
          className="fixed inset-0 z-[80] flex flex-col items-center bg-canvas px-8"
          style={{
            paddingTop: 'env(safe-area-inset-top, 0px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
        >
          {/* Everything from the top of the screen down to the button,
              with the logo centred in it. */}
          <div
            className="flex w-full items-center justify-center"
            style={{ flex: `1 1 ${RESERVED_ABOVE_BUTTON}px` }}
          >
            <LogoLockup size={101} />
          </div>

          <span className="press rounded-full bg-mint-500 px-8 py-4 text-lg font-black tracking-tight text-navy-950 glow-mint">
            Tijd voor Snatzee!
          </span>

          {/* Takes the same share of the free space as the region above,
              which is what pins the button to its old position. */}
          <div aria-hidden style={{ flex: '1 1 0px' }} />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
