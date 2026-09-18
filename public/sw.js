/*
 * Snatzee service worker.
 *
 * Deliberately conservative: static assets are cached so the installed app
 * launches instantly, but every navigation and API call goes to the network
 * first so scores, rankings and achievements are never served stale.
 */
const VERSION = 'snatzee-v2'
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

  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/audio/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/manifest.webmanifest'

  if (!isStatic) return

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
