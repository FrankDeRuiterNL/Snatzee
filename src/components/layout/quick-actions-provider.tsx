'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ScoreSheet, type ScorePrefill, type ScoreSheetResult } from '@/components/score/score-sheet'
import { CelebrationOverlay, type Celebration } from '@/components/score/celebration-overlay'
import { AchievementUnlockSheet } from '@/components/achievements/achievement-unlock-sheet'
import { FirstRollDialog } from '@/components/score/first-roll-dialog'
import { ScanSheet } from '@/components/score/scan/scan-sheet'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import { playSound } from '@/lib/audio'
import { ordinalNl } from '@/lib/utils'
import type { RecordYahtzeeResult, ScoreEntry, UnlockedAchievement } from '@/types/database'

interface QuickActionsValue {
  openScoreSheet: (entry?: ScoreEntry | null) => void
  /** Opens the confirmation; nothing is written until it is accepted. */
  askFirstRollYahtzee: () => void
  yahtzeePending: boolean
}

const QuickActionsContext = createContext<QuickActionsValue | null>(null)

export function useQuickActions() {
  const ctx = useContext(QuickActionsContext)
  if (!ctx) throw new Error('useQuickActions must be used inside <QuickActionsProvider>')
  return ctx
}

/**
 * Owns the two global "register something" flows so they can be triggered
 * from the bottom nav, the home dashboard and the history page alike.
 */
export function QuickActionsProvider({
  children,
  scanEnabled = false,
}: {
  children: ReactNode
  /** Whether the scoresheet scanner is offered — an admin setting while
   *  the reader is being tuned. */
  scanEnabled?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Home-screen shortcuts land on /app?action=… — the score sheet opens from
  // the initial state so no effect has to write state synchronously.
  const shortcut = searchParams.get('action')
  const [sheetOpen, setSheetOpen] = useState(() => shortcut === 'score')
  const [editing, setEditing] = useState<ScoreEntry | null>(null)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const [unlockQueue, setUnlockQueue] = useState<UnlockedAchievement[]>([])
  const [yahtzeePending, setYahtzeePending] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanned, setScanned] = useState<ScorePrefill | null>(null)
  // Seeded from the shortcut so the home-screen "1 worp" action opens the
  // confirmation on first render rather than from an effect.
  const [firstRollOpen, setFirstRollOpen] = useState(
    () => shortcut === 'yahtzee' || shortcut === 'first-roll',
  )
  // Guards against a double-tap firing two inserts before state settles.
  const inFlight = useRef(false)

  const openScoreSheet = useCallback((entry?: ScoreEntry | null) => {
    setEditing(entry ?? null)
    setSheetOpen(true)
  }, [])

  // The scanner takes the whole screen, so the score sheet steps aside
  // rather than stacking behind it, and comes back when the scan is done —
  // which is where the scanned scores will land.
  const openScanner = useCallback(() => {
    setScanned(null)
    setSheetOpen(false)
    setScanOpen(true)
  }, [])

  const closeScanner = useCallback((open: boolean) => {
    setScanOpen(open)
    if (!open) setSheetOpen(true)
  }, [])

  const queueUnlocks = useCallback((unlocked: UnlockedAchievement[]) => {
    if (unlocked.length === 0) return
    playSound('achievement')
    setUnlockQueue((prev) => [...prev, ...unlocked])
  }, [])

  const handleSaved = useCallback(
    (result: ScoreSheetResult) => {
      if (!result.isEdit) playSound('score')
      toast.success(result.isEdit ? 'Potje bijgewerkt ✓' : 'Score opgeslagen ✓', {
        description: `${result.entry.score} punten${result.entry.is_win ? ' · gewonnen' : ''}`,
      })

      if (!result.isEdit && result.isPersonalRecord) {
        setCelebration({
          id: Date.now(),
          variant: 'record',
          emoji: '🏆',
          title: 'Nieuw record',
          headline: `${result.entry.score} punten!`,
          detail: 'Dit is je hoogste score ooit op Snatzee.',
        })
      }

      queueUnlocks(result.unlocked)
      router.refresh()
    },
    [queueUnlocks, router],
  )

  const recordFirstRollYahtzee = useCallback(async () => {
    // Guards a double tap: the ref blocks a second call before React has
    // re-rendered with the pending flag.
    if (inFlight.current) return
    inFlight.current = true
    setYahtzeePending(true)

    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase.rpc('record_yahtzee', {
        p_event_type: 'FIRST_ROLL',
      })

      if (error) {
        toast.error('Registreren is niet gelukt', { description: error.message })
        return
      }

      const result = data as RecordYahtzeeResult
      haptic('warning')
      setFirstRollOpen(false)

      setCelebration({
        id: Date.now(),
        variant: 'firstRoll',
        emoji: '⚡',
        title: 'No way!',
        headline: 'YAHTZEE IN 1 WORP!',
        detail: `Dit was je ${ordinalNl(result.first_roll_yahtzee_count)} ooit.`,
      })

      queueUnlocks(result.unlocked ?? [])
      router.refresh()
    } finally {
      inFlight.current = false
      setYahtzeePending(false)
    }
  }, [queueUnlocks, router])

  const askFirstRollYahtzee = useCallback(() => setFirstRollOpen(true), [])

  // Clear the shortcut from the URL once handled, so a refresh does not
  // re-trigger it, and fire the two Yahtzee shortcuts.
  useEffect(() => {
    if (!shortcut) return
    router.replace(pathname)

  }, [shortcut, pathname, router])

  const value = useMemo(
    () => ({ openScoreSheet, askFirstRollYahtzee, yahtzeePending }),
    [openScoreSheet, askFirstRollYahtzee, yahtzeePending],
  )

  return (
    <QuickActionsContext.Provider value={value}>
      {children}

      <ScoreSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          // The scanned values belong to the sheet that was open; closing
          // it without saving throws them away rather than leaving them
          // to reappear next time.
          if (!open) setScanned(null)
        }}
        entry={editing}
        onSaved={handleSaved}
        onScan={scanEnabled ? openScanner : undefined}
        prefill={scanned}
      />

      {scanEnabled && (
        <ScanSheet
          open={scanOpen}
          onOpenChange={closeScanner}
          onResult={(result) => setScanned({ score: result.total, yahtzee: result.yahtzee })}
        />
      )}

      <FirstRollDialog
        open={firstRollOpen}
        onOpenChange={setFirstRollOpen}
        onConfirm={() => void recordFirstRollYahtzee()}
        pending={yahtzeePending}
      />

      <CelebrationOverlay celebration={celebration} onDismiss={() => setCelebration(null)} />

      <AchievementUnlockSheet
        queue={unlockQueue}
        onAdvance={() => setUnlockQueue((prev) => prev.slice(1))}
      />
    </QuickActionsContext.Provider>
  )
}
