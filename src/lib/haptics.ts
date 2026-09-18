/**
 * Best-effort haptic feedback. Support is patchy (iOS Safari ignores the
 * Vibration API entirely), so this is always additive — never gate
 * functionality on it.
 */
type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning'

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 8,
  medium: 18,
  heavy: 32,
  success: [12, 40, 24],
  warning: [24, 60, 24, 60, 24],
}

export function haptic(pattern: HapticPattern = 'light') {
  if (typeof window === 'undefined') return
  try {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Vibration blocked or unsupported — silently continue.
  }
}
