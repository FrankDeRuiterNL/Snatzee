import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { LogoMark } from '@/components/ui/logo'

/**
 * Where people (and App Review) can reach whoever runs this Snatzee.
 * Read at request time, so one image serves every installation.
 */
export function contactEmail() {
  return process.env.CONTACT_EMAIL || process.env.SMTP_ADMIN_EMAIL || null
}

export function ContactLink() {
  const email = contactEmail()
  if (!email) return <span>de beheerder van deze Snatzee</span>
  return (
    <a href={`mailto:${email}`} className="font-semibold text-ink underline underline-offset-4">
      {email}
    </a>
  )
}

/** Privacy policy, terms and support: plain reading pages. */
export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string
  updated?: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <main
      id="main"
      className="safe-x mx-auto w-full max-w-[40rem] px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 3rem)',
      }}
    >
      <Link
        href="/"
        aria-label="Terug"
        className="press grid size-11 place-items-center rounded-full bg-surface text-ink ring-1 ring-hairline shadow-soft"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </Link>

      <header className="mt-8">
        <LogoMark size={48} />
        <h1 className="mt-5 text-[2rem] font-black leading-tight tracking-tight text-ink">
          {title}
        </h1>
        {updated && <p className="mt-1 text-sm text-ink-muted">Bijgewerkt op {updated}</p>}
        {intro && <div className="mt-4 text-[0.95rem] leading-relaxed text-ink-soft">{intro}</div>}
      </header>

      <div className="mt-8 space-y-8">{children}</div>

      <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
        <Link href="/privacy" className="underline underline-offset-4">
          Privacybeleid
        </Link>
        <Link href="/voorwaarden" className="underline underline-offset-4">
          Voorwaarden
        </Link>
        <Link href="/support" className="underline underline-offset-4">
          Support
        </Link>
      </nav>
    </main>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-extrabold tracking-tight text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-[0.95rem] leading-relaxed text-ink-soft [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  )
}
