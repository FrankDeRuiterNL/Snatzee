/**
 * Resolves the origin a request actually arrived on.
 *
 * Behind a reverse proxy `request.url` carries the internal address
 * (http://app:3000), which would send OAuth callbacks and redirects to an
 * address the browser cannot reach. The forwarded headers set by the gateway
 * are authoritative, so Snatzee works on several domains at once without
 * pinning one of them.
 */
export function siteOrigin(request: Request): string {
  const headers = request.headers
  const forwardedHost = headers.get('x-forwarded-host') ?? headers.get('host')

  if (forwardedHost) {
    const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? 'http'
    return `${proto}://${forwardedHost.split(',')[0]?.trim()}`
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/+$/, '')

  return new URL(request.url).origin
}
