import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/** Next 16 name for what was middleware: refreshes the session cookie and
 *  keeps signed-out visitors out of the app. */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images and the PWA files, which must
     * stay reachable offline and without a session round-trip.
     *
     * The audio and brand folders were missing, so every sound went through
     * a Supabase getUser() call first — and for a signed-out visitor it was
     * redirected to /login outright, which is what the browser saw when the
     * document preloaded the audio logo. A media file the browser cannot
     * load fails playback with NotSupportedError, so the launch sound never
     * arrived no matter when it was attempted.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|audio/|brand/|splash/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest|mp3|ogg|woff2?)$).*)',
  ],
}
