/**
 * Short branded audio cues.
 *
 * Sound is additive: every call is best-effort and silently does nothing when
 * playback is unavailable, muted, or blocked by the browser's autoplay policy.
 * Nothing in the app should ever wait on, or depend on, a sound playing.
 */
export type SoundName = 'logo' | 'achievement' | 'score'

const SOUND_PREFERENCE_KEY = 'snatzee:sound'
/** The audio logo plays once per app launch, not on every navigation. */
const LOGO_PLAYED_KEY = 'snatzee:logo-played'

const VOLUMES: Record<SoundName, number> = {
  logo: 0.55,
  achievement: 0.7,
  score: 0.6,
}

const cache = new Map<SoundName, HTMLAudioElement>()

export function isSoundEnabled() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== 'false'
  } catch {
    // Blocked storage: default to sound on.
    return true
  }
}

export function setSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(enabled))
  } catch {
    // Preference simply will not persist.
  }
}

function getAudio(name: SoundName) {
  const existing = cache.get(name)
  if (existing) return existing

  const audio = new Audio()
  // Opus in ogg is roughly a third smaller; Safari falls back to mp3.
  audio.src = audio.canPlayType('audio/ogg; codecs=opus')
    ? `/audio/${name}.ogg`
    : `/audio/${name}.mp3`
  audio.preload = 'auto'
  audio.volume = VOLUMES[name]
  cache.set(name, audio)
  return audio
}

/** Fire and forget. Returns whether playback was even attempted. */
export function playSound(name: SoundName): boolean {
  if (typeof window === 'undefined' || !isSoundEnabled()) return false

  try {
    const audio = getAudio(name)
    audio.currentTime = 0
    // Rejects when the browser requires a user gesture first.
    void audio.play().catch(() => {})
    return true
  } catch {
    return false
  }
}

/** Warms the cache so the first real cue is not delayed by a fetch. */
export function preloadSounds(names: SoundName[] = ['score', 'achievement']) {
  if (typeof window === 'undefined' || !isSoundEnabled()) return
  for (const name of names) {
    try {
      getAudio(name).load()
    } catch {
      // Ignore: preloading is an optimisation, not a requirement.
    }
  }
}

/**
 * Plays the audio logo once per launch.
 *
 * Browsers block audio until the page has been interacted with, so if the
 * immediate attempt is refused this waits for the first tap — but only
 * briefly, because a launch sound arriving a minute later is worse than none.
 */
export function playLaunchSound() {
  if (typeof window === 'undefined' || !isSoundEnabled()) return

  try {
    if (window.sessionStorage.getItem(LOGO_PLAYED_KEY) === 'true') return
    window.sessionStorage.setItem(LOGO_PLAYED_KEY, 'true')
  } catch {
    // Without sessionStorage it may replay on navigation; acceptable.
  }

  const audio = getAudio('logo')

  const attempt = audio.play()
  if (!attempt) return

  attempt.catch(() => {
    // One shared abort signal detaches both listeners, whether the sound
    // played or the window for it simply expired.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)

    const onGesture = () => {
      clearTimeout(timer)
      controller.abort()
      void audio.play().catch(() => {})
    }

    const options = { once: true, signal: controller.signal } as const
    window.addEventListener('pointerdown', onGesture, options)
    window.addEventListener('keydown', onGesture, options)
  })
}
