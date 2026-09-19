'use client'

/**
 * Installed-app detection and the install prompt.
 *
 * The two platforms that matter here behave differently enough that the UI
 * has to branch on them:
 *
 *  - Chromium fires `beforeinstallprompt`, which can be stashed and replayed
 *    from a button. That is a real one-tap install.
 *  - iOS Safari has no such event and no API to add an app to the homescreen.
 *    Apple deliberately keeps that behind the Share sheet, so the honest best
 *    a button can do there is show where to tap.
 */

export type InstallPlatform = 'prompt' | 'ios' | 'unsupported'

/** A captured `beforeinstallprompt` event. Not in lib.dom yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** True when the app is running from the homescreen rather than a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  // iOS uses a non-standard flag; everyone else reports the display mode.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return (
    iosStandalone === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  )
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ reports itself as a Mac, so the touch points settle it.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

/**
 * Starts listening for `beforeinstallprompt` immediately.
 *
 * The event fires once, early, and is lost if nothing is listening — so this
 * runs at module load rather than from a component's effect.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this Chrome shows its own mini-infobar and never hands the
    // event over.
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function subscribeToInstallState(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getInstallPlatform(): InstallPlatform {
  if (deferredPrompt) return 'prompt'
  if (isIOS()) return 'ios'
  return 'unsupported'
}

/**
 * Replays the stashed install prompt.
 *
 * Returns false when there is nothing to replay, which is the caller's cue to
 * show instructions instead.
 */
export async function promptInstall() {
  if (!deferredPrompt) return false

  const event = deferredPrompt
  // The event can only be used once, whatever the user chooses.
  deferredPrompt = null
  notify()

  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome === 'accepted'
  } catch {
    return false
  }
}
