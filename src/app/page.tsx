import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Dice5, Sparkles, Trophy, Users, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LogoLockup } from '@/components/ui/logo'
import { getCurrentUser } from '@/lib/supabase/queries'

export default async function LandingPage() {
  const user = await getCurrentUser()
  if (user) redirect('/app')

  return (
    <main
      id="main"
      className="safe-x mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col px-5"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
    >
      <header>
        <LogoLockup size={44} />
      </header>

      <section className="mt-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-500/15 px-3 py-1.5 text-xs font-bold text-mint-300">
          <Sparkles className="size-3.5" aria-hidden />
          Voor iedereen die Yahtzee speelt
        </span>

        <h1 className="mt-5 text-[2.6rem] font-black leading-[1.05] tracking-tight text-ink">
          Jouw Yahtzee&#8209;scores,
          <br />
          <span className="text-mint-400">eindelijk bijgehouden.</span>
        </h1>

        <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-soft">
          Speel gewoon met je vertrouwde scoreblaadje. Voeg na afloop je eindscore toe en Snatzee
          regelt de records, statistieken, achievements en ranglijsten.
        </p>
      </section>

      <ul className="mt-8 space-y-3">
        <Feature icon={Dice5} accent="mint" title="Eén tik per potje">
          Score invullen, gewonnen aanvinken, opslaan. Klaar binnen vijf seconden.
        </Feature>
        <Feature icon={Zap} accent="tangerine" title="Yahtzees los registreren">
          Inclusief een aparte knop voor die ene Yahtzee in de eerste worp.
        </Feature>
        <Feature icon={Trophy} accent="grape" title="Ranglijsten & achievements">
          Zes ranglijsten, 36 achievements en records die automatisch worden bijgehouden.
        </Feature>
        <Feature icon={Users} accent="aqua" title="Vrienden en groepen">
          Vergelijk je cijfers met je familie, je collega&apos;s of je vrijdagavondclub.
        </Feature>
      </ul>

      <div
        className="mt-auto space-y-3 pt-10"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        <Button asChild full size="lg">
          <Link href="/register">Gratis account maken</Link>
        </Button>
        <Button asChild full size="lg" variant="soft">
          <Link href="/login">Ik heb al een account</Link>
        </Button>
      </div>
    </main>
  )
}

const ACCENTS = {
  mint: 'bg-mint-500/15 text-mint-300',
  tangerine: 'bg-tangerine-500/15 text-tangerine-300',
  grape: 'bg-grape-500/15 text-grape-300',
  aqua: 'bg-aqua-500/15 text-aqua-300',
} as const

function Feature({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: typeof Dice5
  title: string
  accent: keyof typeof ACCENTS
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-4 rounded-[1.5rem] bg-surface p-4 ring-1 ring-hairline shadow-soft">
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${ACCENTS[accent]}`}>
        <Icon className="size-5" strokeWidth={2.4} aria-hidden />
      </span>
      <span>
        <span className="block font-bold tracking-tight text-ink">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{children}</span>
      </span>
    </li>
  )
}
