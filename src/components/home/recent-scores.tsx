'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { ScoreEntryCard } from '@/components/score/score-entry-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { useQuickActions } from '@/components/layout/quick-actions-provider'
import { formatPlayedAt } from '@/lib/utils'
import type { ScoreEntry } from '@/types/database'

export function RecentScores({ entries }: { entries: ScoreEntry[] }) {
  const { openScoreSheet } = useQuickActions()

  if (entries.length === 0) {
    return (
      <section className="px-5">
        <EmptyState
          emoji="🎲"
          title="Nog geen potjes gespeeld"
          description="Pak de dobbelstenen erbij en voeg na afloop je eerste score toe."
          action={
            <Button full size="lg" onClick={() => openScoreSheet()}>
              Eerste potje toevoegen
            </Button>
          }
        />
      </section>
    )
  }

  // Group by day so the list reads like a diary rather than a log.
  const groups = entries.reduce<Record<string, ScoreEntry[]>>((acc, entry) => {
    const key = formatPlayedAt(entry.played_at)
    ;(acc[key] ??= []).push(entry)
    return acc
  }, {})

  return (
    <section aria-labelledby="recent-heading" className="px-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="recent-heading" className="text-lg font-extrabold tracking-tight text-ink">
          Laatste potjes
        </h2>
        <Link
          href="/app/history"
          className="press inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-ink-muted"
        >
          Alles
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="space-y-4">
        {Object.entries(groups).map(([day, dayEntries]) => (
          <div key={day}>
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
              {day}
            </p>
            <div className="space-y-2">
              {dayEntries.map((entry, index) => (
                <ScoreEntryCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  onClick={() => openScoreSheet(entry)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
