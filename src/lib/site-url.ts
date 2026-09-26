/**
 * Resolves the origin a request actually arrived on.
 *
 * Behind a reverse proxy `request.url` carries the internal address
 * (http://app:3000), which would send OAuth callbacks and redirects to an
 * address the browser cannot reach. The forwarded headers set by the gateway
 * say which domain was really used, so Snatzee works on several domains at
 * once without pinning one of them.
 *
 * Those headers are also whatever the client chose to send, though. With
 * ALLOWED_HOSTS set, only the listed hosts (and the host of
 * NEXT_PUBLIC_SITE_URL) are believed; anything else falls back to the
 * configured site URL, so a forged `X-Forwarded-Host` cannot make the app
 * redirect to somebody else's domain. Unset, every host is accepted, as
 * before.
 */
export function siteOrigin(request: Request): string {
  const headers = request.headers
  const forwardedHost = (headers.get('x-forwarded-host') ?? headers.get('host'))
    ?.split(',')[0]
    ?.trim()
    .toLowerCase()

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')

  if (forwardedHost && isAllowedHost(forwardedHost, configured)) {
    const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
    const scheme = proto === 'https' ? 'https' : 'http'
    return `${scheme}://${forwardedHost}`
  }

  if (configured) return configured

  return new URL(request.url).origin
}

function isAllowedHost(host: string, configured: string | undefined): boolean {
  // Never a header value that could smuggle a path or credentials in.
  if (!/^[a-z0-9.-]+(:\d{1,5})?$|^\[[0-9a-f:]+\](:\d{1,5})?$/.test(host)) return false

  const list = (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (list.length === 0) return true

  if (configured) {
    try {
      list.push(new URL(configured).host.toLowerCase())
    } catch {
      // A malformed site URL simply adds nothing.
    }
  }
  return list.includes(host)
}
