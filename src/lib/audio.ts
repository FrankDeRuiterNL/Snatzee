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
/** Decoded and ready to play. Bound to the context that decoded them. */
const buffers = new Map<SoundName, AudioBuffer>()
/**
 * The undecoded bytes, kept so a replacement context can decode them
 * again without a second download. decodeAudioData detaches what it is
 * given, so it is always handed a copy.
 */
const raw = new Map<SoundName, ArrayBuffer>()
const loading = new Map<SoundName, Promise<AudioBuffer | null>>()

/**
 * Where the launch cue has got to.
 *
 * `waiting` means it was refused and a gesture would start it — the only
 * state in which a tap-to-start screen earns its keep. `done` covers
 * every way of being finished with it: played, already played this
 * session, sound switched off, or the window for it expired.
 */
export type LaunchSoundState = 'idle' | 'waiting' | 'done'

let launchState: LaunchSoundState = 'idle'
const launchListeners = new Set<(state: LaunchSoundState) => void>()

/**
 * Remembers whether the cue was allowed to play on its own.
 *
 * Read by the inline script that decides whether to paint the
 * tap-to-start screen at all: a platform that autoplayed last launch will
 * autoplay this one, so the screen can be suppressed before first paint
 * instead of flashing up and vanishing.
 */
const AUTOPLAY_KEY = 'snatzee:launch-autoplay'

function rememberAutoplay(worked: boolean) {
  try {
    window.localStorage.setItem(AUTOPLAY_KEY, worked ? 'true' : 'false')
  } catch {
    // Without storage the screen simply shows and hides again.
  }
}

function setLaunchState(next: LaunchSoundState) {
  if (launchState === next) return
  launchState = next
  for (const listener of launchListeners) listener(next)
}

export function getLaunchSoundState() {
  return launchState
}

export function subscribeLaunchSound(listener: (state: LaunchSoundState) => void) {
  launchListeners.add(listener)
  return () => {
    launchListeners.delete(listener)
  }
}

let unlockAttached = false

/**
 * Keeps the context awake for sounds that fire outside a gesture.
 *
 * The score and achievement cues play from a callback that runs *after*
 * the save round-trip has resolved, so there is no live user gesture by
 * then. Safari needs resume() to happen inside one, and it puts a context
 * back to `suspended`/`interrupted` when the app is backgrounded or left
 * idle -- so those cues fell silent while the launch sound, which does
 * run in a gesture, kept working.
 *
 * An <audio> element did not have this problem: unlocking one is
 * permanent. A context's state is not, so every gesture is used to top it
 * up. The person pressed "Opslaan" a moment before the sound is wanted,
 * which is all the activation this needs.
 */
function keepUnlocked() {
  if (unlockAttached || typeof window === 'undefined') return
  unlockAttached = true

  const wake = () => {
    const ctx = context
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return
    void ctx.resume().catch(() => {})
  }

  const options = { capture: true, passive: true } as const
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, wake, options)
  }
  // Returning to the app is worth a try too, though it carries no gesture
  // and so only helps where the policy is laxer than Safari's.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') wake()
  })
}

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
  keepUnlocked()
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

  const bytes = raw.get(name)
  const fetched = bytes
    ? Promise.resolve(bytes)
    : fetch(sourceUrl(name))
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error('404'))))
        .then((data) => {
          raw.set(name, data)
          return data
        })

  const promise = fetched
    // A copy, because decodeAudioData detaches the buffer it is given and
    // the original has to survive for a possible second context.
    .then((data) => decode(ctx, data.slice(0)))
    .then((buffer) => {
      buffers.set(name, buffer)
      return buffer
    })
    .catch(() => null)
    .finally(() => loading.delete(name))

  loading.set(name, promise)
  return promise
}

/** Promise form where it exists, callback form for older Safari. */
function decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const maybe = ctx.decodeAudioData(data, resolve, reject)
    if (maybe && typeof maybe.then === 'function') maybe.then(resolve, reject)
  })
}

/**
 * Throws away a context that will not start and forgets everything it
 * decoded, so the next getContext() builds a fresh one.
 *
 * AudioBuffers belong to the context that produced them, hence clearing
 * the cache; the downloaded bytes are kept.
 */
function resetContext() {
  const dead = context
  context = null
  buffers.clear()
  loading.clear()
  try {
    void dead?.close()
  } catch {
    // Already closed, or closing is unsupported. Either is fine.
  }
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
  if (typeof window === 'undefined') return

  // Both early exits report `done`: there is nothing pending, so anything
  // waiting on the cue — the tap-to-start screen — can stop waiting.
  if (!isSoundEnabled()) {
    setLaunchState('done')
    return
  }

  try {
    if (window.sessionStorage.getItem(LOGO_PLAYED_KEY) === 'true') {
      setLaunchState('done')
      return
    }
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
    setLaunchState('done')
    return true
  }

  const attempt = async () => {
    await loadBuffer('logo')
    if (!(await ensureRunning())) return false
    return fire()
  }

  void attempt().then((played) => {
    rememberAutoplay(played)
    if (played) return

    // Autoplay was refused: from here the cue depends on a gesture, which
    // is exactly what the tap-to-start screen exists to provide.
    setLaunchState('waiting')

    const controller = new AbortController()
    // Long enough to catch the first real tap, short enough that the logo
    // never arrives out of nowhere minutes into a session.
    const timer = setTimeout(() => {
      controller.abort()
      // Nobody touched anything in time; stop offering to play it.
      if (!done) setLaunchState('done')
    }, 20_000)
    const stop = () => {
      clearTimeout(timer)
      controller.abort()
    }

    // At most one replacement context, so a genuinely dead one is retried
    // exactly once rather than on every event.
    let recreated = false

    const onGesture = () => {
      if (done) return stop()

      const ctx = getContext()
      if (!ctx) return

      if (ctx.state === 'running') {
        if (fire()) stop()
        return
      }

      // resume() must be called synchronously inside the gesture; the
      // buffer is already decoded by now, so nothing is awaited first.
      void ctx
        .resume()
        .then(() => {
          // A single tap delivers several of these events. Once the cue
          // has played the rest have nothing to do — and must not fall
          // through to the recovery below, which would tear down a
          // perfectly good context and the buffers decoded into it.
          if (done) return stop()
          if (fire()) return stop()

          // Only when the context really refused to start: resumed, and
          // still not running.
          if (!recreated && context && context.state !== 'running') {
            recreated = true
            resetContext()
            void loadBuffer('logo')
          }
        })
        .catch(() => {})
    }

    /*
     * Every gesture, not just the first, and deliberately not `once`.
     *
     * touchstart is not an activation triggering event — the HTML spec
     * lists pointerdown, pointerup, touchend, mousedown and keydown, and
     * WebKit follows it. The previous version listened for touchstart
     * with `once` and a shared abort signal, so on iOS the very first
     * touch tore every listener down and then called resume() with no
     * activation to spend: it never started, and nothing was left
     * listening. That is why the sound stopped entirely.
     *
     * touchstart and pointerdown stay at the front because when they do
     * carry activation the sound lands at touch-down rather than after
     * the tap completes; the rest are the guaranteed ones behind them.
     */
    const options = { capture: true, passive: true, signal: controller.signal } as const
    for (const type of ['touchstart', 'pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
      window.addEventListener(type, onGesture, options)
    }
  })
}
