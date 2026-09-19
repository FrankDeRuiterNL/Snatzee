'use client'

import { useEffect } from 'react'
import { playLaunchSound, preloadSounds } from '@/lib/audio'

/**
 * Plays the Snatzee audio logo once when the app is opened.
 *
 * Mounted from the root layout rather than the app shell: the shell waits on
 * two Supabase round-trips before it renders, which delayed the sound by the
 * whole of that. Here it runs as soon as the first chunk hydrates.
 *
 * The file itself is preloaded from the document head, so by this point the
 * bytes are usually already cached and playback starts immediately.
 */
export function LaunchSound() {
  useEffect(() => {
    // Fetch first so the element is ready the moment playback is allowed.
    preloadSounds(['logo'])
    playLaunchSound()
    preloadSounds(['score', 'achievement'])
  }, [])

  return null
}
