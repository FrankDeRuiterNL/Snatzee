import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { ServiceWorkerRegistrar } from '@/components/layout/service-worker-registrar'
import { AppleSplashLinks } from '@/components/layout/apple-splash-links'
import { LaunchSound } from '@/components/layout/launch-sound'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Snatzee — Yahtzee scores, records & stats',
    template: '%s · Snatzee',
  },
  description:
    'Snatzee houdt je Yahtzee-scores, records, statistieken, achievements en ranglijsten bij. Speel met een gewoon scoreblaadje en voeg achteraf je eindscore toe.',
  applicationName: 'Snatzee',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Snatzee',
    // Lets the app paint under the status bar, which the dark canvas needs.
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon-60.png', sizes: '60x60', type: 'image/png' },
      { url: '/icons/apple-touch-icon-76.png', sizes: '76x76', type: 'image/png' },
      { url: '/icons/apple-touch-icon-120.png', sizes: '120x120', type: 'image/png' },
      { url: '/icons/apple-touch-icon-152.png', sizes: '152x152', type: 'image/png' },
      { url: '/icons/apple-touch-icon-167.png', sizes: '167x167', type: 'image/png' },
      { url: '/icons/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'Snatzee',
    locale: 'nl_NL',
    title: 'Snatzee — Yahtzee scores, records & stats',
    description:
      'Registreer je Yahtzee-eindscores en volg records, statistieken, achievements en ranglijsten met je vrienden.',
  },
}

export const viewport: Viewport = {
  themeColor: '#07131F',
  width: 'device-width',
  initialScale: 1,
  // Locks out the double-tap/pinch zoom that makes a PWA feel like a website,
  // while the 16px input rule keeps text readable without it.
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={jakarta.variable} suppressHydrationWarning>
      <head>
        {/* Starts the audio logo downloading with the document instead of
            after hydration, so it can play the instant it is allowed to. */}
        <link rel="preload" as="audio" href="/audio/logo.mp3" type="audio/mpeg" />
        {/* iOS launch images — one per device size and orientation. */}
        <AppleSplashLinks />
      </head>
      <body className="bg-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-surface-elevated focus:px-4 focus:py-3 focus:text-white"
        >
          Naar hoofdinhoud
        </a>
        {children}
        <Toaster
          position="top-center"
          /* The installed app paints under the status bar (the viewport is
             viewport-fit=cover and the status bar is black-translucent), so
             a flat 16px put toasts behind the notch and the clock. Adding
             the inset keeps them clear of it; in a browser tab the inset is
             0 and this is the same 16px as before. */
          offset="calc(env(safe-area-inset-top, 0px) + 16px)"
          mobileOffset="calc(env(safe-area-inset-top, 0px) + 16px)"
          theme="dark"
          richColors={false}
          toastOptions={{
            className:
              'rounded-2xl! border! border-white/10! bg-surface-elevated! text-ink! shadow-float! font-sans! text-sm!',
          }}
        />
        <ServiceWorkerRegistrar />
        <LaunchSound />
      </body>
    </html>
  )
}
