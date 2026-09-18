/**
 * Supabase connection details.
 *
 * Self-hosted deployments run the Supabase services behind the same gateway as
 * the app, so the browser and the server reach them over different addresses:
 * the browser uses the public origin, while server components and middleware
 * talk to the gateway directly over the Docker network. Hosted Supabase simply
 * leaves `SUPABASE_INTERNAL_URL` unset and both use the same URL.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/** Address the Next.js server itself should use. */
export const SUPABASE_SERVER_URL = process.env.SUPABASE_INTERNAL_URL || SUPABASE_URL

/**
 * Pinned so the browser and the server agree on the auth cookie name.
 *
 * supabase-js otherwise derives the cookie name from the project URL, which
 * would differ between the public origin and the internal gateway address and
 * leave the server unable to find a session the browser just created.
 */
export const SUPABASE_STORAGE_KEY = 'sb-snatzee-auth-token'
