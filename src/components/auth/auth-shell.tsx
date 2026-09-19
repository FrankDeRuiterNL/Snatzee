import Link from 'next/link'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { LogoMark } from '@/components/ui/logo'

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <main
      id="main"
      className="safe-x mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
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
        <LogoMark size={56} />
        <h1 className="mt-5 text-[2rem] font-black leading-tight tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-muted">{subtitle}</p>
      </header>

      <div className="mt-8">{children}</div>
    </main>
  )
}
