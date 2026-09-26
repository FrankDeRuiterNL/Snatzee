import type { NextConfig } from 'next'

/**
 * Avatars are served from `${SUPABASE_URL}/storage/v1/object/public/...`.
 * On a self-hosted stack that is the site's own origin — possibly plain
 * http on a custom port — so the pattern is derived from the configured
 * URL rather than assuming a *.supabase.co host.
 */
const supabaseImagePattern = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return null
  try {
    const url = new URL(raw)
    return {
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      hostname: url.hostname,
      ...(url.port ? { port: url.port } : {}),
      pathname: '/storage/v1/object/public/**',
    }
  } catch {
    return null
  }
})()

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    remotePatterns: [
      ...(supabaseImagePattern ? [supabaseImagePattern] : []),
      // Hosted Supabase projects.
      { protocol: 'https' as const, hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  async rewrites() {
    return [
      // iOS universal links. Apple fetches exactly this path, without an
      // extension, and expects JSON.
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/apple-app-site-association',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default nextConfig
