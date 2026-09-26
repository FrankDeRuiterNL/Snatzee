import 'server-only'

import { signEs256Jwt } from '@/lib/apns'

/**
 * Sign in with Apple, server side.
 *
 * GoTrue does the signing in. What it cannot do is what Apple requires
 * when an account is deleted: revoke the app's tokens for that Apple ID,
 * so the person is really disconnected (App Store guideline 5.1.1(v)).
 * That needs a client secret signed with a Sign in with Apple key, and an
 * authorization code the app gets by asking the person to confirm with
 * Apple once more right before deleting.
 *
 *   APPLE_TEAM_ID             developer team ID
 *   APPLE_SIGNIN_KEY_ID       ID of a key with "Sign in with Apple" enabled
 *   APPLE_SIGNIN_PRIVATE_KEY  that key's .p8 contents; newlines may be \n
 *   APPLE_CLIENT_ID           the same comma-separated list GoTrue uses:
 *                             Services ID (web), bundle ID (iOS app)
 */

const TEAM_ID = process.env.APPLE_TEAM_ID ?? ''
const KEY_ID = process.env.APPLE_SIGNIN_KEY_ID ?? ''
const PRIVATE_KEY = (process.env.APPLE_SIGNIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')

export function appleClientIds(): string[] {
  return (process.env.APPLE_CLIENT_ID ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

export function isAppleRevocationConfigured() {
  return TEAM_ID.length > 0 && KEY_ID.length > 0 && PRIVATE_KEY.length > 0 && appleClientIds().length > 0
}

function clientSecret(clientId: string) {
  const now = Math.floor(Date.now() / 1000)
  return signEs256Jwt(
    PRIVATE_KEY,
    { kid: KEY_ID },
    { iss: TEAM_ID, iat: now, exp: now + 5 * 60, aud: 'https://appleid.apple.com', sub: clientId },
  )
}

/**
 * Exchanges a fresh authorization code for Apple's tokens and revokes
 * them. Returns whether Apple confirmed the revocation.
 */
export async function revokeAppleAuthorization(
  authorizationCode: string,
  clientId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isAppleRevocationConfigured()) return { ok: false, reason: 'not-configured' }
  if (!appleClientIds().includes(clientId)) return { ok: false, reason: 'unknown-client' }

  const secret = clientSecret(clientId)

  const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  })
  if (!tokenResponse.ok) return { ok: false, reason: `token-exchange-${tokenResponse.status}` }

  const tokens = (await tokenResponse.json()) as { refresh_token?: string; access_token?: string }
  const token = tokens.refresh_token ?? tokens.access_token
  if (!token) return { ok: false, reason: 'no-token' }

  const revokeResponse = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      token,
      token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
    }),
  })
  return revokeResponse.ok ? { ok: true } : { ok: false, reason: `revoke-${revokeResponse.status}` }
}
