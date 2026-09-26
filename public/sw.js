/*
 * Snatzee service worker.
 *
 * Deliberately conservative: static assets are cached so the installed app
 * launches instantly, but every navigation and API call goes to the network
 * first so scores, rankings and achievements are never served stale.
 */
const VERSION = 'snatzee-v4'
const STATIC_CACHE = `${VERSION}-static`
const OFFLINE_URL = '/offline'

const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

/*
 * Web Push.
 *
 * iOS only delivers these to an app that was added to the homescreen, and
 * only ever through the service worker — there is no foreground path. A
 * push that arrives without a readable payload still has to show something:
 * every platform terminates the subscription of a worker that receives a
 * push and shows no notification.
 */
function parsePushPayload(event) {
  const fallback = {
    title: 'Snatzee',
    body: 'Er is iets nieuws in Snatzee.',
    url: '/app',
    tag: 'snatzee',
  }

  if (!event.data) return fallback

  try {
    const data = event.data.json()
    return {
      title: data.title || fallback.title,
      body: data.body || fallback.body,
      url: data.url || fallback.url,
      tag: data.tag || fallback.tag,
      icon: data.icon,
      badge: data.badge,
      data: data.data,
    }
  } catch {
    // A plain-text push is valid too.
    const text = event.data.text()
    return { ...fallback, body: text || fallback.body }
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event)

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/icon-192.png',
      // Collapses repeats of the same kind instead of stacking them up.
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url, ...(payload.data || {}) },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = new URL(event.notification.data?.url || '/app', self.location.origin)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open window when there is one: on iOS a second window is a
      // second cold start of the whole app.
      for (const client of clients) {
        if (new URL(client.url).origin !== target.origin) continue
        // navigate() is refused for a window this worker does not control;
        // the focused window is still better than nothing.
        return client
          .focus()
          .then((focused) => focused.navigate?.(target.href) ?? focused)
          .catch(() => client)
      }
      return self.clients.openWindow(target.href)
    }),
  )
})

/*
 * Push services rotate endpoints. The browser tells the worker when that
 * happens, but the worker has no session, so the page re-registers on its
 * next launch — this only makes sure the stale endpoint is not used again.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' })
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Never cache auth callbacks or Next.js server actions.
  if (url.pathname.startsWith('/auth/')) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return cached ?? Response.error()
      }),
    )
    return
  }

  // Build output has the content hash in its name, so a cached copy is
  // never out of date.
  const isImmutable = url.pathname.startsWith('/_next/static/')

  // Icons, sounds and the manifest keep their names when they change.
  // Served from cache for speed, refreshed in the background so a new
  // version arrives on the next launch instead of never.
  const isRefreshable =
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/audio/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/manifest.webmanifest'

  if (isRefreshable) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok && response.status === 200) cache.put(request, response.clone()).catch(() => {})
            return response
          })
          .catch(() => cached ?? Response.error())
        if (cached) {
          event.waitUntil(fresh.catch(() => {}))
          return cached
        }
        return fresh
      }),
    )
    return
  }

  if (!isImmutable) return

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
