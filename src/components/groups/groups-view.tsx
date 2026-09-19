'use client'

import { useCallback, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ChevronRight, Keyboard, Plus, QrCode, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/sheet'
import { FieldError, Input, Label, Textarea } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/utils'
import { parseInviteCode } from '@/lib/invite'
import { QrScanner } from '@/components/groups/qr-scanner'

const EMOJI_CHOICES = ['🎲', '👨‍👩‍👧', '🏖️', '💼', '🍻', '🏆', '🌙', '🔥', '🧩', '🥇']

export interface GroupSummary {
  id: string
  name: string
  emoji: string | null
  description: string | null
  member_count: number
}

export function GroupsView({ groups }: { groups: GroupSummary[] }) {
  const router = useRouter()
  const nameId = useId()
  const descId = useId()
  const codeId = useId()

  // A QR code scanned with the phone's own camera app lands here as
  // ?code=..., so the sheet opens ready to confirm rather than making
  // someone retype what they just scanned. Seeded from the initial render
  // so no effect has to write state.
  const searchParams = useSearchParams()
  const linkedCode = parseInviteCode(searchParams.get('code') ?? '')

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(() => linkedCode !== null)
  const [joinMode, setJoinMode] = useState<'choose' | 'code' | 'scan'>(() =>
    linkedCode ? 'code' : 'choose',
  )
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎲')
  const [description, setDescription] = useState('')
  const [code, setCode] = useState(() => linkedCode ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function createGroup(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    if (name.trim().length < 2) {
      setError('Geef je groep een naam van minimaal 2 tekens')
      return
    }

    setBusy(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()
    const { error: rpcError } = await supabase.rpc('create_group', {
      p_name: name.trim(),
      p_emoji: emoji,
      p_description: description.trim() || null,
      p_image_url: null,
    })
    setBusy(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    haptic('success')
    toast.success('Groep aangemaakt 🎉')
    setCreateOpen(false)
    setName('')
    setDescription('')
    setEmoji('🎲')
    router.refresh()
  }

  const submitCode = useCallback(
    async (raw: string) => {
      const parsed = parseInviteCode(raw)
      if (!parsed) {
        setError('Dat is geen geldige uitnodigingscode')
        return
      }

      setBusy(true)
      setError(null)
      const supabase = getSupabaseBrowserClient()
      const { error: rpcError } = await supabase.rpc('join_group', { p_invite_code: parsed })
      setBusy(false)

      if (rpcError) {
        setError(rpcError.message)
        return
      }

      haptic('success')
      toast.success('Je zit in de groep!')
      setJoinOpen(false)
      setJoinMode('choose')
      setCode('')
      // Drops ?code= so a refresh does not reopen the sheet.
      router.replace('/app/groups')
      router.refresh()
    },
    [router],
  )

  async function joinGroup(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    await submitCode(code)
  }

  // The scanner fires as soon as it decodes anything, so it joins straight
  // away: the person already chose this group by pointing at its code.
  const handleScan = useCallback(
    (value: string) => {
      const parsed = parseInviteCode(value)
      if (!parsed) {
        setError('Deze QR-code hoort niet bij een Snatzee-groep')
        setJoinMode('code')
        return
      }
      setCode(parsed)
      void submitCode(parsed)
    },
    [submitCode],
  )

  function openJoin() {
    haptic('light')
    setError(null)
    setJoinMode('choose')
    setJoinOpen(true)
  }

  return (
    <div className="space-y-4 px-5">
      {groups.length === 0 ? (
        <EmptyState
          emoji="👥"
          title="Nog geen groepen"
          description="Maak een groep voor je familie, je collega's of je vaste vrijdagavondclub en vergelijk jullie cijfers."
          action={
            <div className="space-y-2">
              <Button full onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" aria-hidden />
                Groep maken
              </Button>
              <Button full variant="ghost" onClick={openJoin}>
                Ik heb een uitnodiging
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {groups.map((group, index) => (
              <motion.li
                key={group.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(index * 0.04, 0.3) }}
              >
                <Link
                  href={`/app/groups/${group.id}`}
                  className="press flex items-center gap-4 rounded-[1.5rem] bg-surface p-4 ring-1 ring-hairline shadow-soft"
                >
                  <span
                    aria-hidden
                    className="grid size-12 shrink-0 place-items-center rounded-2xl bg-canvas text-2xl"
                  >
                    {group.emoji ?? '🎲'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold tracking-tight text-ink">
                      {group.name}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-ink-muted">
                      {group.member_count} {pluralize(group.member_count, 'lid', 'leden')}
                      {group.description ? ` · ${group.description}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
                </Link>
              </motion.li>
            ))}
          </ul>

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Nieuwe groep
            </Button>
            <Button variant="soft" className="flex-1" onClick={openJoin}>
              <Ticket className="size-4" aria-hidden />
              Groep joinen
            </Button>
          </div>
        </>
      )}

      <BottomSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nieuwe groep"
        description="Groepen zijn er voor de sociale context — geen wedstrijden, wel ranglijsten."
        footer={
          <Button type="submit" form="create-group" full size="lg" loading={busy}>
            Groep maken
          </Button>
        }
      >
        <form id="create-group" onSubmit={createGroup} className="space-y-5 pb-2">
          <div>
            <Label htmlFor={nameId}>Naam</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Familie"
              autoFocus
            />
            <FieldError>{error}</FieldError>
          </div>

          <div>
            <Label>Icoon</Label>
            <div className="scroll-x no-scrollbar -mx-5 flex gap-2 px-5">
              {EMOJI_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => {
                    haptic('light')
                    setEmoji(choice)
                  }}
                  aria-label={`Icoon ${choice}`}
                  aria-pressed={emoji === choice}
                  className={`press grid size-12 shrink-0 place-items-center rounded-2xl text-2xl ring-1 ${
                    emoji === choice ? 'bg-mint-500/15 ring-mint-500' : 'bg-surface ring-hairline'
                  }`}
                >
                  <span aria-hidden>{choice}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor={descId}>
              Omschrijving <span className="font-normal text-ink-muted">(optioneel)</span>
            </Label>
            <Textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="Bijv. het jaarlijkse vakantietoernooi"
            />
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={joinOpen}
        onOpenChange={(open) => {
          setJoinOpen(open)
          // Closing leaves the camera behind; unmounting the scanner is
          // what releases it.
          if (!open) setJoinMode('choose')
        }}
        title="Groep joinen"
        description={
          joinMode === 'scan'
            ? 'Scan de QR-code die het andere groepslid laat zien.'
            : joinMode === 'code'
              ? 'Vul de uitnodigingscode in die je van een groepslid kreeg.'
              : 'Scan een QR-code of vul de code in die je hebt gekregen.'
        }
        footer={
          joinMode === 'code' ? (
            <Button type="submit" form="join-group" full size="lg" loading={busy}>
              Deelnemen
            </Button>
          ) : undefined
        }
      >
        {joinMode === 'choose' && (
          <div className="space-y-3 pb-4">
            <Button
              full
              size="lg"
              onClick={() => {
                haptic('light')
                setError(null)
                setJoinMode('scan')
              }}
            >
              <QrCode className="size-5" aria-hidden />
              QR Code scannen
            </Button>
            <Button
              variant="soft"
              full
              size="lg"
              onClick={() => {
                haptic('light')
                setError(null)
                setJoinMode('code')
              }}
            >
              <Keyboard className="size-5" aria-hidden />
              Code invoeren
            </Button>
          </div>
        )}

        {joinMode === 'scan' && (
          <div className="space-y-3 pb-4">
            <QrScanner onResult={handleScan} />
            {busy && (
              <p className="text-center text-sm text-mint-300" role="status">
                Bezig met deelnemen…
              </p>
            )}
            <FieldError>{error}</FieldError>
            <Button variant="ghost" full onClick={() => setJoinMode('choose')}>
              Terug
            </Button>
          </div>
        )}

        {joinMode === 'code' && (
          <form id="join-group" onSubmit={joinGroup} className="pb-2">
            <Label htmlFor={codeId}>Uitnodigingscode</Label>
            <Input
              id={codeId}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="A1B2C3D4"
              className="text-center text-2xl font-black tracking-[0.3em]"
            />
            <FieldError>{error}</FieldError>
            <Button variant="ghost" full className="mt-3" onClick={() => setJoinMode('choose')}>
              Terug
            </Button>
          </form>
        )}
      </BottomSheet>
    </div>
  )
}
