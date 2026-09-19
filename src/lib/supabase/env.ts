/**
 * Supabase connection details.
 *
 * Three different addresses are in play, which is why this is not a single
 * constant:
 *
 *  - The browser. On a self-hosted stack the gateway serves the Supabase APIs
 *    under /auth/v1, /rest/v1 and /storage/v1 on the *same origin* as the app,
 *    so the browser should simply call whatever domain it is already on. That
 *    is what makes serving the app on several domains work: a URL baked in at
 *    build time can only ever name one of them, and requests from the others
 *    would be cross-origin, with the session cookie on the wrong domain.
 *
 *  - The Next.js server. It talks to the gateway over the Docker network and
 *    never goes back out through a public hostname.
 *
 *  - Hosted Supabase. There the API genuinely lives on another origin, so the
 *    configured absolute URL is used everywhere.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Address the Next.js server itself should use. */
export const SUPABASE_SERVER_URL = process.env.SUPABASE_INTERNAL_URL || SUPABASE_URL

/** True when the Supabase APIs are served from the app's own origin. */
export const SUPABASE_SAME_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_SAME_ORIGIN === 'true'

/**
 * The URL the browser should use.
 *
 * Same-origin deployments follow the address bar, so the app works on every
 * domain it is served from without a rebuild.
 */
export function getBrowserSupabaseUrl() {
  if (SUPABASE_SAME_ORIGIN && typeof window !== 'undefined') {
    return window.location.origin
  }
  return SUPABASE_URL
}

/**
 * Canonical base for stored public file URLs.
 *
 * Avatar URLs are written into the database, so they must not depend on which
 * domain the upload happened to be made from — otherwise the same avatar would
 * be stored under different hosts and only some of them would be allowed by
 * the image optimiser.
 */
export function publicStorageUrl(bucket: string, path: string) {
  const base = (SUPABASE_URL || '').replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${bucket}/${path}`
}

/**
 * Pinned so the browser and the server agree on the auth cookie name.
 *
 * supabase-js otherwise derives the cookie name from the project URL, which
 * would differ between domains and between the public origin and the internal
 * gateway address, leaving the server unable to find a session the browser
 * just created.
 */
export const SUPABASE_STORAGE_KEY = 'sb-snatzee-auth-token'
