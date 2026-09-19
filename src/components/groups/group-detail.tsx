'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, LogOut, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/sheet'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RankingsView } from '@/components/rankings/rankings-view'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import { pluralize } from '@/lib/utils'
import { pingNotificationDrain } from '@/lib/push'

export interface GroupMemberRow {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  role: 'owner' | 'admin' | 'member'
  games_played: number
}

export function GroupDetail({
  group,
  members,
  friends,
  isOwner,
  minGamesForAverage,
}: {
  group: { id: string; name: string; emoji: string | null; description: string | null; invite_code: string }
  members: GroupMemberRow[]
  friends: { id: string; username: string; display_name: string; avatar_url: string | null }[]
  isOwner: boolean
  minGamesForAverage: number
}) {
  const router = useRouter()
  const [membersOpen, setMembersOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [removing, setRemoving] = useState<GroupMemberRow | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const memberIds = new Set(members.map((m) => m.user_id))
  const invitable = friends.filter((f) => !memberIds.has(f.id))

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.invite_code)
      haptic('success')
      toast.success('Code gekopieerd', { description: group.invite_code })
    } catch {
      toast.info(`Uitnodigingscode: ${group.invite_code}`)
    }
  }

  async function addMembers() {
    if (busy || selected.length === 0) return
    setBusy(true)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('add_group_members', {
      p_group_id: group.id,
      p_user_ids: selected,
    })
    setBusy(false)

    if (error) {
      toast.error('Toevoegen is niet gelukt', { description: error.message })
      return
    }

    haptic('success')
    pingNotificationDrain()
    toast.success(`${selected.length} ${pluralize(selected.length, 'lid', 'leden')} toegevoegd`)
    setSelected([])
    setInviteOpen(false)
    router.refresh()
  }

  async function leaveGroup() {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('leave_group', { p_group_id: group.id })

    if (error) {
      toast.error('Verlaten is niet gelukt', { description: error.message })
      return
    }
    toast.success('Je hebt de groep verlaten')
    router.replace('/app/groups')
    router.refresh()
  }

  async function removeMember() {
    if (!removing) return
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('remove_group_member', {
      p_group_id: group.id,
      p_user_id: removing.user_id,
    })

    if (error) {
      toast.error('Verwijderen is niet gelukt', { description: error.message })
      return
    }
    toast.success(`${removing.display_name} is verwijderd`)
    setRemoving(null)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <section className="mx-5 rounded-[1.75rem] bg-surface-elevated p-6 text-white shadow-lift">
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="grid size-14 shrink-0 place-items-center rounded-2xl bg-surface/10 text-3xl"
          >
            {group.emoji ?? '🎲'}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight">{group.name}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {members.length} {pluralize(members.length, 'lid', 'leden')}
            </p>
          </div>
        </div>

        {group.description && (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">{group.description}</p>
        )}

        <div className="mt-5 flex -space-x-2">
          {members.slice(0, 7).map((member) => (
            <Avatar
              key={member.user_id}
              src={member.avatar_url}
              name={member.display_name}
              size="sm"
              className="ring-2 ring-hairline-strong"
            />
          ))}
          {members.length > 7 && (
            <span className="grid size-10 place-items-center rounded-full bg-surface/10 text-xs font-bold ring-2 ring-hairline-strong">
              +{members.length - 7}
            </span>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => setMembersOpen(true)}
          >
            Leden
          </Button>
          <Button
            variant="soft"
            size="sm"
            className="flex-1 bg-surface/10! text-white! ring-white/20!"
            onClick={copyCode}
          >
            <Copy className="size-4" aria-hidden />
            {group.invite_code}
          </Button>
        </div>
      </section>

      <div className="px-5">
        <h2 className="text-lg font-extrabold tracking-tight text-ink">Ranglijsten</h2>
        <p className="mt-0.5 text-sm text-ink-muted">Alleen de leden van {group.name}.</p>
      </div>

      <RankingsView
        groups={[{ id: group.id, name: group.name, emoji: group.emoji }]}
        minGamesForAverage={minGamesForAverage}
        initialScope="group"
        initialGroupId={group.id}
        lockedScope
      />

      <div className="px-5 pt-2">
        <Button variant="dangerSoft" full onClick={() => setLeaveOpen(true)}>
          <LogOut className="size-4" aria-hidden />
          Groep verlaten
        </Button>
      </div>

      <BottomSheet
        open={membersOpen}
        onOpenChange={setMembersOpen}
        title="Leden"
        description={`${members.length} ${pluralize(members.length, 'lid', 'leden')} in ${group.name}`}
        footer={
          invitable.length > 0 ? (
            <Button
              full
              size="lg"
              onClick={() => {
                setMembersOpen(false)
                setInviteOpen(true)
              }}
            >
              <UserPlus className="size-5" aria-hidden />
              Vrienden toevoegen
            </Button>
          ) : undefined
        }
      >
        <ul className="space-y-2 pb-2">
          {members.map((member) => (
            <li
              key={member.user_id}
              className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-hairline"
            >
              <Link
                href={`/u/${member.username}`}
                className="press flex min-w-0 flex-1 items-center gap-3"
              >
                <Avatar src={member.avatar_url} name={member.display_name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-bold text-ink">
                    {member.display_name}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    @{member.username} · {member.games_played}{' '}
                    {pluralize(member.games_played, 'potje', 'potjes')}
                  </span>
                </span>
              </Link>

              {member.role === 'owner' ? (
                <span className="rounded-full bg-tangerine-500/15 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-tangerine-300">
                  Eigenaar
                </span>
              ) : isOwner ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${member.display_name} verwijderen uit de groep`}
                  onClick={() => setRemoving(member)}
                >
                  <UserMinus className="size-5 text-ink-muted" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </BottomSheet>

      <BottomSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Vrienden toevoegen"
        description="Kies wie je aan deze groep wilt toevoegen."
        footer={
          <Button full size="lg" loading={busy} disabled={selected.length === 0} onClick={addMembers}>
            {selected.length === 0
              ? 'Selecteer vrienden'
              : `${selected.length} ${pluralize(selected.length, 'vriend', 'vrienden')} toevoegen`}
          </Button>
        }
      >
        <ul className="space-y-2 pb-2">
          {invitable.map((friend) => {
            const checked = selected.includes(friend.id)
            return (
              <li key={friend.id}>
                <button
                  type="button"
                  aria-pressed={checked}
                  onClick={() => {
                    haptic('light')
                    setSelected((prev) =>
                      checked ? prev.filter((id) => id !== friend.id) : [...prev, friend.id],
                    )
                  }}
                  className={`press flex w-full items-center gap-3 rounded-2xl p-3 text-left ring-1 ${
                    checked ? 'bg-mint-500/15 ring-mint-500' : 'bg-surface ring-hairline'
                  }`}
                >
                  <Avatar src={friend.avatar_url} name={friend.display_name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-ink">
                      {friend.display_name}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">@{friend.username}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </BottomSheet>

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Groep verlaten?"
        description={
          isOwner
            ? 'Je bent de eigenaar. Het eigenaarschap gaat over naar een ander lid, of de groep wordt verwijderd als jij het laatste lid bent.'
            : `Je verdwijnt uit de ranglijsten van ${group.name}. Je kunt later opnieuw deelnemen met de uitnodigingscode.`
        }
        confirmLabel="Verlaten"
        destructive
        onConfirm={leaveGroup}
      />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Lid verwijderen?"
        description={removing ? `${removing.display_name} verlaat ${group.name}.` : undefined}
        confirmLabel="Verwijderen"
        destructive
        onConfirm={removeMember}
      />
    </div>
  )
}
