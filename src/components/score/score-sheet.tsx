'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Dice5, ScanLine, Trophy } from 'lucide-react'
import { BottomSheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Stepper } from '@/components/ui/stepper'
import { ScoreWheel } from '@/components/score/score-wheel'
import { ToggleRow } from '@/components/ui/toggle-row'
import { FieldError, Input, Label, Textarea } from '@/components/ui/input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { NOTE_MAX, SCORE_MAX, SCORE_MIN } from '@/lib/constants'
import { cn, fromDateInputValue, toDateInputValue } from '@/lib/utils'
import { haptic } from '@/lib/haptics'
import type { RecordScoreResult, ScoreEntry } from '@/types/database'
import { pingNotificationDrain } from '@/lib/push'

export interface ScoreSheetResult {
  entry: ScoreEntry
  unlocked: RecordScoreResult['unlocked']
  isPersonalRecord: boolean
  isEdit: boolean
}

export function ScoreSheet({
  open,
  onOpenChange,
  entry,
  onSaved,
  onScan,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: ScoreEntry | null
  onSaved: (result: ScoreSheetResult) => void
  /** Opens the scoresheet scanner. Absent when the setting is off, which
   *  is what keeps the whole feature out of the app while it is being
   *  tuned. Never offered when editing: the potje already exists. */
  onScan?: () => void
}) {
  const isEdit = Boolean(entry)
  const [saving, setSaving] = useState(false)

  return (
    <BottomSheet
      open={open}
      onOpenChange={saving ? () => {} : onOpenChange}
      title={isEdit ? 'Potje bewerken' : 'Potje toevoegen'}
      description={
        isEdit
          ? 'Pas je geregistreerde resultaat aan.'
          : 'Vul je eindresultaat in — klaar in 5 seconden.'
      }
      footer={
        <Button type="submit" form="score-form" full size="lg" loading={saving} disabled={saving}>
          <Check className="size-5" aria-hidden />
          {isEdit ? 'Wijzigingen opslaan' : 'Potje opslaan'}
        </Button>
      }
    >
      {/*
        Keying on the entry remounts the form with fresh defaults every time the
        sheet opens, instead of re-syncing state from an effect.
      */}
      {open && (
        <ScoreForm
          key={entry?.id ?? 'new'}
          entry={entry ?? null}
          saving={saving}
          onSavingChange={setSaving}
          onScan={isEdit ? undefined : onScan}
          onDone={(result) => {
            onOpenChange(false)
            onSaved(result)
          }}
        />
      )}
    </BottomSheet>
  )
}

function ScoreForm({
  entry,
  saving,
  onSavingChange,
  onDone,
  onScan,
}: {
  entry: ScoreEntry | null
  saving: boolean
  onSavingChange: (saving: boolean) => void
  onDone: (result: ScoreSheetResult) => void
  onScan?: () => void
}) {
  const isEdit = entry !== null
  const scoreId = useId()
  const dateId = useId()
  const noteId = useId()

  const [score, setScore] = useState(entry?.score ?? 0)
  const [isWin, setIsWin] = useState(entry?.is_win ?? false)
  const [threwYahtzee, setThrewYahtzee] = useState((entry?.yahtzee_count ?? 0) > 0)
  const [yahtzeeCount, setYahtzeeCount] = useState(Math.max(entry?.yahtzee_count ?? 0, 1))
  const [playedAt, setPlayedAt] = useState(() =>
    entry ? toDateInputValue(new Date(entry.played_at)) : toDateInputValue(),
  )
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    // The wheel cannot leave this range, but the value still goes through the
    // same check the database applies.
    if (!Number.isFinite(score) || score < SCORE_MIN || score > SCORE_MAX) {
      setError(`Score moet tussen ${SCORE_MIN} en ${SCORE_MAX} liggen`)
      return
    }
    const parsed = score

    onSavingChange(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()

    // The stepper keeps its value while the toggle is off, so the count only
    // counts when the player actually says they threw one.
    const yahtzees = threwYahtzee ? yahtzeeCount : 0

    const { data, error: rpcError } = isEdit
      ? await supabase.rpc('update_score_entry', {
          p_id: entry.id,
          p_score: parsed,
          p_is_win: isWin,
          p_played_at: fromDateInputValue(playedAt),
          p_note: note.trim() || null,
          p_yahtzee_count: yahtzees,
        })
      : await supabase.rpc('record_score_entry', {
          p_score: parsed,
          p_is_win: isWin,
          p_played_at: fromDateInputValue(playedAt),
          p_note: note.trim() || null,
          p_yahtzee_count: yahtzees,
        })

    onSavingChange(false)

    if (rpcError) {
      setError(rpcError.message || 'Opslaan is niet gelukt. Probeer het nog eens.')
      return
    }

    const result = data as RecordScoreResult
    haptic('success')
    // A new top score dethrones someone; the trigger queued it already.
    pingNotificationDrain()
    onDone({
      entry: result.entry,
      unlocked: result.unlocked ?? [],
      isPersonalRecord: Boolean(result.is_personal_record),
      isEdit,
    })
  }

  return (
    <form id="score-form" onSubmit={handleSubmit} className="space-y-6 pb-2">
      {onScan && (
        <button
          type="button"
          onClick={onScan}
          className="press flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left ring-1 ring-hairline"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-mint-500/15 text-mint-400">
            <ScanLine className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.95rem] font-semibold text-ink">Scoreblad scannen</span>
            <span className="block text-xs text-ink-muted">
              Maak een foto van je papieren blad in plaats van zelf in te vullen.
            </span>
          </span>
        </button>
      )}

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <Label htmlFor={scoreId} className="mb-0">
            Eindscore
          </Label>
          <output
            id={scoreId}
            aria-live="polite"
            className="tabular text-2xl font-black tracking-tight text-mint-400"
          >
            {score}
          </output>
        </div>

        <ScoreWheel value={score} onChange={setScore} />

        <p className="mt-2 text-center text-xs text-ink-muted">
          Scroll om je score te kiezen · {SCORE_MIN}–{SCORE_MAX} punten
        </p>
        <FieldError>{error}</FieldError>
      </div>

      <div>
        <Label>Gewonnen?</Label>
        <div className="grid grid-cols-2 gap-2">
          <WinOption
            selected={isWin}
            onSelect={() => {
              haptic('light')
              setIsWin(true)
            }}
            label="Gewonnen"
            icon={<Trophy className="size-5" aria-hidden />}
            tone="win"
          />
          <WinOption
            selected={!isWin}
            onSelect={() => {
              haptic('light')
              setIsWin(false)
            }}
            label="Niet gewonnen"
            icon={<Dice5 className="size-5" aria-hidden />}
            tone="loss"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-4 ring-1 ring-hairline">
        <ToggleRow
          label="Yahtzee gegooid?"
          description="Tel de Yahtzees die je tijdens dit potje gooide."
          checked={threwYahtzee}
          onCheckedChange={(next) => {
            setThrewYahtzee(next)
            if (next && yahtzeeCount < 1) setYahtzeeCount(1)
          }}
        />

        <AnimatePresence initial={false}>
          {threwYahtzee && (
            <motion.div
              key="yahtzee-count"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <Label htmlFor="yahtzee-stepper">Hoeveel Yahtzee&apos;s?</Label>
                <Stepper
                  label="Aantal Yahtzee's"
                  value={yahtzeeCount}
                  onChange={setYahtzeeCount}
                  min={1}
                  max={30}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <Label htmlFor={dateId}>Datum gespeeld</Label>
        <Input
          id={dateId}
          type="date"
          value={playedAt}
          max={toDateInputValue()}
          onChange={(e) => setPlayedAt(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor={noteId}>
          Notitie <span className="font-normal text-ink-muted">(optioneel)</span>
        </Label>
        <Textarea
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          placeholder="Bijv. vakantiepotje met het hele gezin"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </form>
  )
}

function WinOption({
  selected,
  onSelect,
  label,
  icon,
  tone,
}: {
  selected: boolean
  onSelect: () => void
  label: string
  icon: React.ReactNode
  tone: 'win' | 'loss'
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'press flex min-h-14 items-center justify-center gap-2 rounded-2xl text-[0.95rem] font-semibold ring-1 transition-colors',
        selected && tone === 'win' && 'bg-mint-500 text-navy-950 ring-mint-500',
        selected && tone === 'loss' && 'bg-surface-elevated text-white ring-hairline-strong',
        !selected && 'bg-canvas text-ink-soft ring-hairline',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
