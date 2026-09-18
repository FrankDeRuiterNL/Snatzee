import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { ServiceWorkerRegistrar } from '@/components/layout/service-worker-registrar'
import { AppleSplashLinks } from '@/components/layout/apple-splash-links'
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
    statusBarStyle: 'default',
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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F7F5' },
    { media: '(prefers-color-scheme: dark)', color: '#F7F7F5' },
  ],
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
        {/* iOS launch images — one per device size and orientation. */}
        <AppleSplashLinks />
      </head>
      <body className="bg-cream-100">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-navy-900 focus:px-4 focus:py-3 focus:text-white"
        >
          Naar hoofdinhoud
        </a>
        {children}
        <Toaster
          position="top-center"
          offset={16}
          toastOptions={{
            className:
              'rounded-2xl! border-none! bg-navy-900! text-white! shadow-float! font-sans! text-sm!',
          }}
        />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
