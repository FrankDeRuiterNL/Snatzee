import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export const metadata = { title: 'Offline' }

export default function OfflinePage() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm">
        <EmptyState
          emoji="📡"
          title="Je bent offline"
          description="Snatzee heeft internet nodig om je scores en ranglijsten op te halen. Zodra je weer verbinding hebt, werkt alles gewoon."
          action={
            <Button asChild full>
              <Link href="/app">Opnieuw proberen</Link>
            </Button>
          }
        />
      </div>
    </main>
  )
}
