import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Served as /.well-known/apple-app-site-association (see next.config.ts).
 *
 * Tells iOS which links on this domain belong to the Snatzee app, so a
 * shared profile, a confirmation mail or a tapped notification opens the
 * app instead of Safari. The same file lets iOS offer saved passwords
 * for this site in the app's login form.
 *
 * APPLE_APP_IDS: comma-separated "<TEAMID>.<bundle id>", e.g.
 *   ABCDE12345.nl.snatzee.app
 * Unset, the file lists no apps and no link is taken over.
 */
export function GET() {
  const appIDs = (process.env.APPLE_APP_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs,
            components: [
              // GoTrue's own endpoints must keep reaching the server.
              { '/': '/auth/v1/*', exclude: true },
              { '/': '/u/*', comment: 'Public profiles' },
              // The admin console stays on the website.
              { '/': '/app/admin', exclude: true },
              { '/': '/app/admin/*', exclude: true },
              { '/': '/app', comment: 'The app itself' },
              { '/': '/app/*' },
              { '/': '/auth/confirm', comment: 'Email confirmation and magic links' },
              { '/': '/auth/callback' },
            ],
          },
        ],
      },
      webcredentials: { apps: appIDs },
    },
    {
      headers: {
        // Apple's CDN caches it anyway; an hour keeps a change visible
        // without hammering the app.
        'Cache-Control': 'public, max-age=3600',
      },
    },
  )
}
