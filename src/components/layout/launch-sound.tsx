'use client'

import { useEffect } from 'react'
import { playLaunchSound, preloadSounds } from '@/lib/audio'

/** Plays the Snatzee audio logo once when the app is opened. */
export function LaunchSound() {
  useEffect(() => {
    playLaunchSound()
    preloadSounds()
  }, [])

  return null
}
