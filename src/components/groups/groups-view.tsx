'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ChevronRight, Plus, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/sheet'
import { FieldError, Input, Label, Textarea } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/utils'

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

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎲')
  const [description, setDescription] = useState('')
  const [code, setCode] = useState('')
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

  async function joinGroup(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    const supabase = getSupabaseBrowserClient()
    const { error: rpcError } = await supabase.rpc('join_group', {
      p_invite_code: code.trim().toUpperCase(),
    })
    setBusy(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    haptic('success')
    toast.success('Je zit in de groep!')
    setJoinOpen(false)
    setCode('')
    router.refresh()
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
              <Button full variant="ghost" onClick={() => setJoinOpen(true)}>
                Ik heb een uitnodigingscode
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
            <Button variant="soft" className="flex-1" onClick={() => setJoinOpen(true)}>
              <Ticket className="size-4" aria-hidden />
              Code invoeren
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
        onOpenChange={setJoinOpen}
        title="Groep joinen"
        description="Vul de uitnodigingscode in die je van een groepslid kreeg."
        footer={
          <Button type="submit" form="join-group" full size="lg" loading={busy}>
            Deelnemen
          </Button>
        }
      >
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
        </form>
      </BottomSheet>
    </div>
  )
}
