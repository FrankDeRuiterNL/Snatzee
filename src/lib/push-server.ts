import 'server-only'

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_SERVER_URL } from '@/lib/supabase/env'

/**
 * Sending side of Web Push.
 *
 * Deliveries are signed with the VAPID private key, which never leaves the
 * server, and the subscription rows are read with the service role because
 * the sender acts on someone else's behalf — RLS would (correctly) hide them
 * from any user-scoped client.
 *
 * What gets sent is decided by database triggers that fill the
 * notification outbox; drainNotifications() below is what delivers it.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@snatzee.nl'

/** True when the server has everything it needs to push. */
export function isPushConfigured() {
  return VAPID_PUBLIC_KEY.length > 0 && VAPID_PRIVATE_KEY.length > 0
}

let configured = false
function configure() {
  if (configured) return
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
}

export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')

  return createClient(SUPABASE_SERVER_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface PushPayload {
  title: string
  body: string
  /** In-app path to open when the notification is tapped. */
  url?: string
  /** Notifications sharing a tag replace one another instead of stacking. */
  tag?: string
  data?: Record<string, unknown>
}

interface SubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * Sends a notification to every device a user has registered.
 *
 * Returns how many deliveries succeeded. A 404 or 410 from the push service
 * means the subscription is dead — the row is dropped so the table does not
 * fill up with endpoints that will never be reachable again.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!isPushConfigured()) return { sent: 0, removed: 0, skipped: 'not-configured' as const }

  configure()
  const supabase = serviceClient()

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !data?.length) return { sent: 0, removed: 0 }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? '/app',
    tag: payload.tag ?? 'snatzee',
    data: payload.data ?? {},
  })

  const expired: string[] = []
  let sent = 0

  await Promise.all(
    (data as SubscriptionRow[]).map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 60 * 60 * 24 },
        )
        sent += 1
      } catch (sendError) {
        const status = (sendError as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) expired.push(row.endpoint)
      }
    }),
  )

  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expired)
  }

  return { sent, removed: expired.length }
}

/** Same, for several people at once. */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const results = await Promise.all(userIds.map((id) => sendPushToUser(id, payload)))
  return results.reduce(
    (total, result) => ({ sent: total.sent + result.sent, removed: total.removed + result.removed }),
    { sent: 0, removed: 0 },
  )
}

interface OutboxRow {
  id: string
  user_id: string
  kind: string
  title: string
  body: string
  url: string
  data: Record<string, unknown> | null
}

function notificationTag(row: OutboxRow) {
  const kind = row.kind.toLowerCase()
  // Admin messages are each their own news; never let one replace another.
  if (row.kind === 'ADMIN_BROADCAST') return `snatzee-${kind}-${row.id.slice(0, 8)}`
  const groupId = typeof row.data?.group_id === 'string' ? row.data.group_id : null
  return groupId ? `snatzee-${kind}-${groupId.slice(0, 8)}` : `snatzee-${kind}`
}

/**
 * Flushes the notification outbox.
 *
 * The queue is filled by database triggers, because only Postgres sees
 * every friend request, group add and toppling of the top score as it
 * happens — and only this process can sign a push request. Claiming is a
 * separate step from completing, so an overlapping flush takes a
 * different batch rather than sending anything twice.
 */
export async function drainNotifications(limit = 50) {
  if (!isPushConfigured()) return { claimed: 0, sent: 0, failed: 0, skipped: 'not-configured' as const }

  const supabase = serviceClient()

  const { data, error } = await supabase.rpc('claim_notifications', { p_limit: limit })
  if (error || !data?.length) return { claimed: 0, sent: 0, failed: 0 }

  const rows = data as OutboxRow[]
  let sent = 0
  let failed = 0

  await Promise.all(
    rows.map(async (row) => {
      try {
        const result = await sendPushToUser(row.user_id, {
          title: row.title,
          body: row.body,
          url: row.url,
          // Per kind (and per group for group scores), so a second friend
          // request replaces the first on the lock screen instead of
          // stacking. Tags are per device, so this is already per person.
          tag: notificationTag(row),
          data: row.data ?? {},
        })

        if (result.sent > 0) {
          sent += 1
          await supabase.rpc('complete_notification', { p_id: row.id, p_error: null })
        } else {
          // Nothing reachable: record it rather than leaving the row
          // claimed forever with no explanation.
          failed += 1
          await supabase.rpc('complete_notification', {
            p_id: row.id,
            p_error: 'Geen bereikbare apparaten',
          })
        }
      } catch (sendError) {
        failed += 1
        await supabase.rpc('complete_notification', {
          p_id: row.id,
          p_error: String((sendError as Error)?.message ?? sendError).slice(0, 200),
        })
      }
    }),
  )

  return { claimed: rows.length, sent, failed }
}
