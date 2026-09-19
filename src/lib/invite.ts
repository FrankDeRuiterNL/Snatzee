/**
 * Group invite codes, and the links a QR code carries.
 *
 * The QR encodes a full URL rather than the bare code, so a phone's own
 * camera app can open it directly — someone without Snatzee installed
 * lands on the app instead of staring at a code they cannot use. The
 * in-app scanner accepts either shape.
 */

/** The link a QR code points at. Follows the domain it was generated on. */
export function inviteUrl(code: string, origin?: string) {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/app/groups?code=${encodeURIComponent(code)}`
}

/** Codes are 8 uppercase hex characters, but be generous about what is accepted. */
function normalise(value: string) {
  const code = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null
}

/**
 * Turns whatever was scanned or pasted into an invite code.
 *
 * Accepts a full invite URL, a bare code, or a code with stray spacing or
 * dashes in it. Returns null when it is neither.
 */
export function parseInviteCode(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null

  if (/^https?:\/\//i.test(text)) {
    try {
      const fromQuery = new URL(text).searchParams.get('code')
      return fromQuery ? normalise(fromQuery) : null
    } catch {
      return null
    }
  }

  return normalise(text)
}
