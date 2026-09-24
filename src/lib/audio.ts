/**
 * Short branded audio cues.
 *
 * Played through the Web Audio API rather than <audio> elements, and that
 * is the whole point of this file's shape. An <audio> element on iOS is
 * media: the system registers it with Now Playing, so after the launch
 * sound the lock screen showed "Home · Snatzee" with a play button and a
 * scrubber, as though the app were a paused podcast. Web Audio is treated
 * as app sound effects instead and never appears there.
 *
 * Sound stays additive: every call is best-effort and silently does
 * nothing when playback is unavailable, muted, or blocked by the
 * browser's autoplay policy. Nothing should ever wait on, or depend on,
 * a sound playing.
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

/**
 * mp3 for everything.
 *
 * The ogg/opus variants are smaller, but decodeAudioData on Safari cannot
 * read them, and the saving across three short cues is a couple of tens
 * of kilobytes. One format keeps the preload in the document pointing at
 * the file that is actually fetched.
 */
const sourceUrl = (name: SoundName) => `/audio/${name}.mp3`

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

/**
 * `navigator.audioSession`, which is not in lib.dom yet.
 *
 * Only Safari implements it at the time of writing; everywhere else the
 * property is simply absent and the block below does nothing.
 */
interface AudioSessionLike {
  type: 'auto' | 'playback' | 'transient' | 'transient-solo' | 'ambient' | 'play-and-record'
}

/**
 * Declares these sounds as ambient: mixable with whatever else is playing.
 *
 * Largely belt-and-braces. Safari already treats a page holding an
 * AudioContext as ambient under the default `auto`, so the switch away
 * from <audio> elements is what actually stopped Snatzee interrupting
 * someone's music. Saying it explicitly pins the category, so the user
 * agent cannot decide from its own heuristics that a cue is media and
 * promote the page to `playback`, which would pause their music.
 *
 * Ambient obeys the ringer switch, which is correct for UI sound: a
 * phone on silent should stay silent.
 */
function declareAmbient() {
  try {
    const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession
    if (session) session.type = 'ambient'
  } catch {
    // Unsupported or read-only: the default is already close enough.
  }
}

let context: AudioContext | null = null
const buffers = new Map<SoundName, AudioBuffer>()
const loading = new Map<SoundName, Promise<AudioBuffer | null>>()

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (context) return context

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  try {
    context = new Ctor()
  } catch {
    return null
  }

  declareAmbient()
  return context
}

/** Fetches and decodes once; repeat calls share the same promise. */
function loadBuffer(name: SoundName): Promise<AudioBuffer | null> {
  const ready = buffers.get(name)
  if (ready) return Promise.resolve(ready)

  const inFlight = loading.get(name)
  if (inFlight) return inFlight

  const ctx = getContext()
  if (!ctx) return Promise.resolve(null)

  const promise = fetch(sourceUrl(name))
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('404'))))
    // Callback form as well as the promise: older Safari only has the
    // callback signature, and returns undefined from decodeAudioData.
    .then(
      (data) =>
        new Promise<AudioBuffer>((resolve, reject) => {
          const maybe = ctx.decodeAudioData(data, resolve, reject)
          if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject)
        }),
    )
    .then((buffer) => {
      buffers.set(name, buffer)
      return buffer
    })
    .catch(() => null)
    .finally(() => loading.delete(name))

  loading.set(name, promise)
  return promise
}

/** Starts a decoded buffer. Returns false when it could not be played. */
function start(name: SoundName): boolean {
  const ctx = getContext()
  const buffer = buffers.get(name)
  if (!ctx || !buffer || ctx.state !== 'running') return false

  try {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = VOLUMES[name]
    source.connect(gain).connect(ctx.destination)
    source.start()
    return true
  } catch {
    return false
  }
}

/**
 * Resumes the context if a gesture allows it.
 *
 * A context created without one starts suspended, and resume() only takes
 * effect from inside a user gesture — the same rule that governs <audio>,
 * so this is no more restrictive than before.
 */
function isRunning() {
  // Read through the module variable rather than a narrowed local: resume()
  // changes the state at runtime, which the control-flow analysis cannot see.
  return context?.state === 'running'
}

async function ensureRunning(): Promise<boolean> {
  const ctx = getContext()
  if (!ctx) return false
  if (isRunning()) return true

  try {
    // Raced on purpose. Without user activation Chrome leaves resume()
    // pending forever rather than rejecting it, so awaiting it bare
    // strands the caller -- which is exactly what stopped the launch
    // sound's gesture fallback from ever being attached.
    await Promise.race([ctx.resume(), new Promise((resolve) => setTimeout(resolve, 250))])
  } catch {
    return false
  }

  return isRunning()
}

/** Fire and forget. Returns whether playback was even attempted. */
export function playSound(name: SoundName): boolean {
  if (typeof window === 'undefined' || !isSoundEnabled()) return false

  void (async () => {
    await loadBuffer(name)
    if (await ensureRunning()) start(name)
  })()

  return true
}

/** Warms the cache so the first real cue is not delayed by a fetch. */
export function preloadSounds(names: SoundName[] = ['logo', 'score', 'achievement']) {
  if (typeof window === 'undefined' || !isSoundEnabled()) return
  for (const name of names) void loadBuffer(name)
}

/**
 * Plays the audio logo once per launch.
 *
 * Autoplay is the difficulty. No browser starts audible playback before
 * the page has been interacted with, and an app opened from the
 * homescreen never has been — the launch was a tap on an icon in another
 * process. Chrome makes an exception for installed apps; Safari does not,
 * at any iOS version.
 *
 * What it can do is arrive ON the first touch rather than after it. The
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

  // Whichever path gets there first wins; the other becomes a no-op, so a
  // late resume and a first tap cannot both fire the sound.
  let done = false
  const fire = () => {
    if (done) return false
    if (!start('logo')) return false
    done = true
    markPlayed()
    return true
  }

  const attempt = async () => {
    await loadBuffer('logo')
    if (!(await ensureRunning())) return false
    return fire()
  }

  void attempt().then((played) => {
    if (played) return

    // One shared abort signal detaches every listener, whether the sound
    // played or the window for it simply expired.
    const controller = new AbortController()
    // Long enough to catch the first real tap, short enough that the logo
    // never arrives out of nowhere minutes into a session.
    const timer = setTimeout(() => controller.abort(), 20_000)

    const onGesture = () => {
      clearTimeout(timer)
      controller.abort()
      // resume() must be called synchronously inside the gesture; the
      // buffer is already decoded by now, so nothing is awaited first.
      const ctx = getContext()
      if (!ctx) return
      if (ctx.state === 'running') fire()
      else void ctx.resume().then(fire).catch(() => {})
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
