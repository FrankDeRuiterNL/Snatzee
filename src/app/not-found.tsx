import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Niet gevonden' }

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm">
        <EmptyState
          emoji="🔍"
          title="Pagina niet gevonden"
          description="Deze pagina bestaat niet (meer). Misschien is de speler van naam veranderd of is de link verouderd."
          action={
            <Button asChild full>
              <Link href="/app">Terug naar Snatzee</Link>
            </Button>
          }
        />
      </div>
    </main>
  )
}
