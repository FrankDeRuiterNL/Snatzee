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
  //
  // The logo is the exception: it is the one sound the document preloads,
  // and a preload can only name one file. Picking the format here would
  // mean Chrome and Firefox fetching the ogg while the preloaded mp3 went
  // unused, which is exactly the delay the preload exists to remove.
  audio.src =
    name !== 'logo' && audio.canPlayType('audio/ogg; codecs=opus')
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
export function preloadSounds(names: SoundName[] = ['logo', 'score', 'achievement']) {
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
 * Autoplay is the whole difficulty here. No browser will start audible
 * playback before the page has been interacted with, and an app opened
 * from the homescreen is never interacted with — the launch is a tap on
 * an icon in another process. Chrome makes an exception for installed
 * apps; Safari does not, at any iOS version, so on iPhone the sound
 * genuinely cannot arrive before the first touch.
 *
 * What it can do is arrive ON that touch rather than after it. The
 * listeners are registered in the CAPTURE phase, so they run before the
 * app's own handlers: touching a navigation button starts the sound at
 * touch-down, instead of once the next page has rendered.
 */
export function playLaunchSound() {
  if (typeof window === 'undefined' || !isSoundEnabled()) return

  try {
    if (window.sessionStorage.getItem(LOGO_PLAYED_KEY) === 'true') return
  } catch {
    // Without sessionStorage it may replay on navigation; acceptable.
  }

  const markPlayed = () => {
    try {
      window.sessionStorage.setItem(LOGO_PLAYED_KEY, 'true')
    } catch {
      // Ignore: the flag is a nicety, not a requirement.
    }
  }

  const audio = getAudio('logo')

  const attempt = audio.play()
  if (!attempt) return

  attempt.then(markPlayed).catch(() => {
    // One shared abort signal detaches every listener, whether the sound
    // played or the window for it simply expired.
    const controller = new AbortController()
    // Long enough to catch the first real tap, short enough that the logo
    // never arrives out of nowhere minutes into a session.
    const timer = setTimeout(() => controller.abort(), 20_000)

    const onGesture = () => {
      clearTimeout(timer)
      controller.abort()
      // Must stay synchronous inside the gesture: awaiting anything first
      // spends the permission the tap just granted.
      void audio.play().then(markPlayed).catch(() => {})
    }

    // Capture phase, so this is the first handler to see the gesture
    // rather than the last. touchstart is listed as well because iOS
    // fires it before pointerdown on some versions, and whichever
    // arrives first aborts the rest.
    const options = { once: true, capture: true, passive: true, signal: controller.signal } as const
    window.addEventListener('touchstart', onGesture, options)
    window.addEventListener('pointerdown', onGesture, options)
    window.addEventListener('keydown', onGesture, options)
  })
}
