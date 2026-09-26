import 'server-only'

import http2 from 'node:http2'
import { createPrivateKey, sign, type KeyObject } from 'node:crypto'

/**
 * Apple Push Notification service, for the iOS app.
 *
 * Token-based: one .p8 key from the Apple developer account signs a short
 * JWT, which APNs accepts for every device of every app on that team. No
 * certificates to renew, and no extra dependency — HTTP/2 and ES256 are
 * both in Node.
 *
 *   APNS_KEY_ID       the key's ID (10 characters)
 *   APNS_TEAM_ID      the developer team ID (10 characters)
 *   APNS_PRIVATE_KEY  the .p8 file's contents; newlines may be written \n
 *   APNS_BUNDLE_ID    the app's bundle ID, sent as the push topic
 */

const KEY_ID = process.env.APNS_KEY_ID ?? ''
const TEAM_ID = process.env.APNS_TEAM_ID ?? ''
const BUNDLE_ID = process.env.APNS_BUNDLE_ID ?? ''
const PRIVATE_KEY = (process.env.APNS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const

export type ApnsEnvironment = keyof typeof HOSTS

export function isApnsConfigured() {
  return KEY_ID.length > 0 && TEAM_ID.length > 0 && BUNDLE_ID.length > 0 && PRIVATE_KEY.length > 0
}

// --- The provider token ------------------------------------------------
// APNs rejects a token older than an hour and throttles one refreshed more
// than every 20 minutes, so it is reused for 50.

let key: KeyObject | null = null
let cached: { jwt: string; issuedAt: number } | null = null

const base64url = (input: Buffer | string) => Buffer.from(input).toString('base64url')

/** An ES256 JWT, as both APNs and Sign in with Apple expect them. */
export function signEs256Jwt(
  privateKey: KeyObject | string,
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
): string {
  const keyObject = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey
  const head = base64url(JSON.stringify({ alg: 'ES256', ...header }))
  const body = base64url(JSON.stringify(claims))
  const signature = sign('sha256', Buffer.from(`${head}.${body}`), {
    key: keyObject,
    // JWS wants the raw r||s pair, not DER.
    dsaEncoding: 'ieee-p1363',
  })
  return `${head}.${body}.${base64url(signature)}`
}

function providerToken(): string {
  const now = Math.floor(Date.now() / 1000)
  if (cached && now - cached.issuedAt < 50 * 60) return cached.jwt

  key ??= createPrivateKey(PRIVATE_KEY)
  cached = { jwt: signEs256Jwt(key, { kid: KEY_ID }, { iss: TEAM_ID, iat: now }), issuedAt: now }
  return cached.jwt
}

// --- Connections ------------------------------------------------------
// One HTTP/2 connection per gateway, kept open: Apple asks providers to
// reuse connections rather than open one per notification.

const sessions = new Map<ApnsEnvironment, http2.ClientHttp2Session>()

function session(environment: ApnsEnvironment) {
  const existing = sessions.get(environment)
  if (existing && !existing.closed && !existing.destroyed) return existing

  const created = http2.connect(HOSTS[environment])
  created.on('error', () => sessions.delete(environment))
  created.on('close', () => sessions.delete(environment))
  // Let the process exit while a connection is idle.
  created.unref()
  sessions.set(environment, created)
  return created
}

export interface ApnsMessage {
  title: string
  body: string
  /** In-app path to open, handed to the app in the payload. */
  url?: string
  /** Notifications sharing it replace one another (max 64 bytes). */
  collapseId?: string
  data?: Record<string, unknown>
}

export type ApnsResult =
  | { ok: true }
  /** The token will never work again; forget it. */
  | { ok: false; gone: true; reason: string }
  | { ok: false; gone: false; reason: string }

/** Sends one notification to one device. */
export function sendApns(
  token: string,
  environment: ApnsEnvironment,
  message: ApnsMessage,
): Promise<ApnsResult> {
  const payload = JSON.stringify({
    aps: {
      alert: { title: message.title, body: message.body },
      sound: 'default',
      'thread-id': message.collapseId ?? 'snatzee',
    },
    url: message.url ?? '/app',
    ...(message.data ?? {}),
  })

  const headers: http2.OutgoingHttpHeaders = {
    ':method': 'POST',
    ':path': `/3/device/${token}`,
    authorization: `bearer ${providerToken()}`,
    'apns-topic': BUNDLE_ID,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    // A day, like the Web Push TTL: old news is not worth a late alert.
    'apns-expiration': String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
    'content-type': 'application/json',
  }
  if (message.collapseId) {
    headers['apns-collapse-id'] = Buffer.from(message.collapseId).subarray(0, 64).toString()
  }

  return new Promise((resolve) => {
    let stream: http2.ClientHttp2Stream
    try {
      stream = session(environment).request(headers)
    } catch (error) {
      resolve({ ok: false, gone: false, reason: String((error as Error).message ?? error) })
      return
    }

    let status = 0
    let body = ''
    stream.setEncoding('utf8')
    stream.setTimeout(10_000, () => stream.close(http2.constants.NGHTTP2_CANCEL))
    stream.on('response', (responseHeaders) => {
      status = Number(responseHeaders[':status'] ?? 0)
    })
    stream.on('data', (chunk: string) => {
      body += chunk
    })
    stream.on('error', (error) => resolve({ ok: false, gone: false, reason: error.message }))
    stream.on('close', () => {
      if (status === 200) return resolve({ ok: true })
      let reason = `HTTP ${status || 'no response'}`
      try {
        reason = (JSON.parse(body) as { reason?: string }).reason ?? reason
      } catch {
        // Keep the status as the reason.
      }
      // 410: the app was removed. BadDeviceToken: a token from the other
      // environment or simply not a token. Either way, never again.
      const gone = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered'
      resolve({ ok: false, gone, reason })
    })
    stream.end(payload)
  })
}
