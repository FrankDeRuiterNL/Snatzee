'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Dice5, ScanLine, Trophy } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { SheetForm } from '@/components/score/sheet-form'
import {
  emptySheet,
  isValidSheet,
  sheetTotals,
  TOPSCORE_ROW,
} from '@/lib/scoresheet/sheet'
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

/** A game read off a photographed scoresheet, waiting to be saved. */
export interface ScorePrefill {
  score: number
  yahtzee: boolean
  /** The thirteen boxes behind that score. */
  entries: number[]
}

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
  prefill,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry?: ScoreEntry | null
  onSaved: (result: ScoreSheetResult) => void
  /** Filled in from a scanned sheet; the player still submits it. */
  prefill?: ScorePrefill | null
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
      // Swiping down does not close this one: the sheet is long enough
      // to scroll, and losing a half-filled game to a scroll that started
      // at the wrong pixel is worse than one extra tap on the cross.
      swipeToClose={false}
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
          // A fresh scan remounts the form, so its values replace whatever
          // was typed before rather than being merged with it.
          key={entry?.id ?? (prefill ? `scan-${prefill.score}-${prefill.yahtzee}` : 'new')}
          prefill={prefill ?? null}
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
  prefill,
}: {
  entry: ScoreEntry | null
  prefill: ScorePrefill | null
  saving: boolean
  onSavingChange: (saving: boolean) => void
  onDone: (result: ScoreSheetResult) => void
  onScan?: () => void
}) {
  const isEdit = entry !== null
  const scoreId = useId()
  const dateId = useId()
  const noteId = useId()

  /*
   * Two ways to enter a game, and the sheet is the source of truth in
   * one of them.
   *
   * Most of the time a player knows their final score and wants it in
   * five seconds, so that stays the default. Filling the sheet in per
   * row is for when the paper is in front of you — or when a photo of it
   * has just been read — and then the score is not typed at all: it is
   * what the rows add up to, with the bonus applied the way the sheet
   * applies it.
   */
  const startSheet = entry?.sheet ?? prefill?.entries ?? null
  const [sheet, setSheet] = useState<number[]>(() =>
    isValidSheet(startSheet) ? [...startSheet] : emptySheet(),
  )
  const [perRow, setPerRow] = useState(() => isValidSheet(startSheet))
  const sheetScore = sheetTotals(sheet).total

  const [score, setScore] = useState(entry?.score ?? prefill?.score ?? 0)
  const [isWin, setIsWin] = useState(entry?.is_win ?? false)
  const [threwYahtzee, setThrewYahtzee] = useState(
    entry ? (entry.yahtzee_count ?? 0) > 0 : Boolean(prefill?.yahtzee),
  )
  const [yahtzeeCount, setYahtzeeCount] = useState(Math.max(entry?.yahtzee_count ?? 0, 1))
  const [playedAt, setPlayedAt] = useState(() =>
    entry ? toDateInputValue(new Date(entry.played_at)) : toDateInputValue(),
  )
  const [note, setNote] = useState(entry?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    // Whichever way the game was entered, the value still goes through
    // the same check the database applies.
    const parsed = perRow ? sheetScore : score
    if (!Number.isFinite(parsed) || parsed < SCORE_MIN || parsed > SCORE_MAX) {
      setError(`Score moet tussen ${SCORE_MIN} en ${SCORE_MAX} liggen`)
      return
    }

    onSavingChange(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()

    // The stepper keeps its value while the toggle is off, so the count only
    // counts when the player actually says they threw one.
    const yahtzees = threwYahtzee ? yahtzeeCount : 0
    // The sheet only travels with the score when it is the sheet that
    // produced it; a score typed on the wheel has no boxes behind it.
    const rows = perRow ? sheet : null

    const { data, error: rpcError } = isEdit
      ? await supabase.rpc('update_score_entry', {
          p_id: entry.id,
          p_score: parsed,
          p_is_win: isWin,
          p_played_at: fromDateInputValue(playedAt),
          p_note: note.trim() || null,
          p_yahtzee_count: yahtzees,
          p_sheet: rows,
          // A game that had a sheet and is now saved from the wheel
          // loses it: a stored sheet that does not add up to the stored
          // score would make the history tell two different stories.
          p_clear_sheet: rows === null,
        })
      : await supabase.rpc('record_score_entry', {
          p_score: parsed,
          p_is_win: isWin,
          p_played_at: fromDateInputValue(playedAt),
          p_note: note.trim() || null,
          p_yahtzee_count: yahtzees,
          p_sheet: rows,
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
      {prefill && (
        <p className="rounded-2xl bg-mint-500/10 px-4 py-3 text-sm text-mint-300">
          Overgenomen van je scoreblad. Controleer de score en sla hem op.
        </p>
      )}

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
        <div className="mb-3">
          <Segmented
            value={perRow ? 'sheet' : 'total'}
            onChange={(next) => setPerRow(next === 'sheet')}
            options={[
              { key: 'total' as const, label: 'Eindscore' },
              { key: 'sheet' as const, label: 'Per onderdeel' },
            ]}
            ariaLabel="Hoe wil je invullen?"
          />
        </div>

        <div className="mb-2 flex items-baseline justify-between">
          <Label htmlFor={scoreId} className="mb-0">
            Eindscore
          </Label>
          <output
            id={scoreId}
            aria-live="polite"
            className="tabular text-2xl font-black tracking-tight text-mint-400"
          >
            {perRow ? sheetScore : score}
          </output>
        </div>

        {perRow ? (
          <SheetForm
            value={sheet}
            onChange={(next) => {
              setSheet(next)
              // The wheel keeps up, so switching back shows the score the
              // sheet worked out rather than an older one.
              setScore(sheetTotals(next).total)
              if ((next[TOPSCORE_ROW] ?? 0) > 0 && !threwYahtzee) {
                setThrewYahtzee(true)
                setYahtzeeCount((count) => Math.max(count, 1))
              }
            }}
          />
        ) : (
          <>
            <ScoreWheel value={score} onChange={setScore} />
            <p className="mt-2 text-center text-xs text-ink-muted">
              Scroll om je score te kiezen · {SCORE_MIN}–{SCORE_MAX} punten
            </p>
          </>
        )}
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
