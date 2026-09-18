'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Snatzee app error:', error)
  }, [error])

  return (
    <div className="grid min-h-[70dvh] place-items-center px-5">
      <EmptyState
        emoji="😵"
        title="Er ging iets mis"
        description="We konden dit scherm niet laden. Probeer het opnieuw — je gegevens zijn veilig."
        action={
          <Button full onClick={reset}>
            Opnieuw proberen
          </Button>
        }
      />
    </div>
  )
}
