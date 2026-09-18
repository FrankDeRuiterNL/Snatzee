import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Dice5, Flame, Sparkles, Trophy, Users, Zap } from 'lucide-react'
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-100 px-3 py-1.5 text-xs font-bold text-mint-700">
          <Sparkles className="size-3.5" aria-hidden />
          Voor iedereen die Yahtzee speelt
        </span>

        <h1 className="mt-5 text-[2.6rem] font-black leading-[1.05] tracking-tight text-navy-900">
          Jouw Yahtzee&#8209;scores,
          <br />
          <span className="text-mint-600">eindelijk bijgehouden.</span>
        </h1>

        <p className="mt-4 text-[1.05rem] leading-relaxed text-navy-500">
          Speel gewoon met je vertrouwde scoreblaadje. Voeg na afloop je eindscore toe en Snatzee
          regelt de records, statistieken, achievements en ranglijsten.
        </p>
      </section>

      <section className="mt-9 rounded-[1.75rem] bg-navy-900 p-6 text-white shadow-lift">
        <p className="text-sm font-semibold text-navy-300">Jouw gemiddelde</p>
        <p className="tabular mt-1 text-5xl font-black tracking-tight">247</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-mint-400">
          <Flame className="size-4" aria-hidden />
          +12 sinds vorige maand
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Potjes', value: '128' },
            { label: 'Wins', value: '54' },
            { label: "Yahtzee's", value: '23' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/5 py-3">
              <p className="tabular text-xl font-extrabold">{stat.value}</p>
              <p className="mt-0.5 text-[0.7rem] font-semibold text-navy-300">{stat.label}</p>
            </div>
          ))}
        </div>
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
  mint: 'bg-mint-100 text-mint-700',
  tangerine: 'bg-tangerine-100 text-tangerine-600',
  grape: 'bg-grape-100 text-grape-600',
  aqua: 'bg-aqua-100 text-aqua-500',
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
    <li className="flex gap-4 rounded-[1.5rem] bg-white p-4 ring-1 ring-navy-100/70 shadow-soft">
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${ACCENTS[accent]}`}>
        <Icon className="size-5" strokeWidth={2.4} aria-hidden />
      </span>
      <span>
        <span className="block font-bold tracking-tight text-navy-900">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-navy-300">{children}</span>
      </span>
    </li>
  )
}
