'use client'

import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Web Push subscription handling.
 *
 * Notes that shaped this:
 *
 *  - iOS only delivers push to an app added to the homescreen. In a Safari
 *    tab `PushManager` is not there at all, so support has to be feature
 *    detected rather than assumed from the iOS version.
 *  - Every platform requires `Notification.requestPermission()` to be called
 *    from a user gesture. There is no way to make the permission sheet appear
 *    on its own — the app can only put a button in front of the person at the
 *    right moment, which is what the prompt components do.
 *  - The endpoint the browser hands out can be rotated silently, so the app
 *    re-registers on every launch instead of trusting a stored flag.
 */

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

/** True when this browser can subscribe at all — and the server can send. */
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    VAPID_PUBLIC_KEY.length > 0
  )
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** VAPID keys travel as base64url; PushManager wants the raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const raw = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

function encodeKey(subscription: PushSubscription, name: 'p256dh' | 'auth') {
  const key = subscription.getKey(name)
  if (!key) return null
  return window.btoa(String.fromCharCode(...new Uint8Array(key)))
}

async function readyRegistration() {
  // `ready` resolves once a worker is actually controlling the page, which
  // registration alone does not guarantee on a first visit.
  return navigator.serviceWorker.ready
}

/** Stores a browser subscription against the signed-in account. */
async function persist(subscription: PushSubscription) {
  const p256dh = encodeKey(subscription, 'p256dh')
  const auth = encodeKey(subscription, 'auth')
  if (!p256dh || !auth) return false

  const supabase = getSupabaseBrowserClient()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent,
  })

  return !error
}

/**
 * Asks for permission (if needed) and registers this device.
 *
 * Must be called from a user gesture: browsers ignore a permission request
 * that is not tied to one, and on iOS the call throws outright.
 */
export async function enablePush(): Promise<
  { ok: true } | { ok: false; reason: 'unsupported' | 'denied' | 'failed' }
> {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }

  let permission = Notification.permission
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission()
    } catch {
      return { ok: false, reason: 'failed' }
    }
  }
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    const registration = await readyRegistration()
    const existing = await registration.pushManager.getSubscription()
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        // Silent pushes are not allowed; every push shows a notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }))

    return (await persist(subscription)) ? { ok: true } : { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/** Unsubscribes this device and forgets it server-side. */
export async function disablePush() {
  if (!isPushSupported()) return true

  try {
    const registration = await readyRegistration()
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return true

    const supabase = getSupabaseBrowserClient()
    await supabase.rpc('delete_push_subscription', { p_endpoint: subscription.endpoint })
    await subscription.unsubscribe()
    return true
  } catch {
    return false
  }
}

/** True when this device currently has a live subscription. */
export async function hasLocalSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return false
  try {
    const registration = await readyRegistration()
    return (await registration.pushManager.getSubscription()) !== null
  } catch {
    return false
  }
}

/**
 * Re-registers an existing subscription with the server.
 *
 * Cheap, idempotent, and the only thing that keeps a rotated endpoint from
 * going quiet: it runs on launch, without asking for anything.
 */
export async function refreshPushSubscription() {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  try {
    const registration = await readyRegistration()
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) await persist(subscription)
  } catch {
    // Nothing to do: the next launch tries again.
  }
}
