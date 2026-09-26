'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'

interface BlockedUser {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
}

/** The players you blocked, each with a way back. */
export function BlockedUsers() {
  const [users, setUsers] = useState<BlockedUser[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSupabaseBrowserClient()
      .rpc('list_blocked_users')
      .then(({ data }: { data: unknown }) => {
        if (!cancelled) setUsers((data as BlockedUser[] | null) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function unblock(user: BlockedUser) {
    if (busy) return
    setBusy(user.user_id)
    const { error } = await getSupabaseBrowserClient().rpc('unblock_user', {
      p_user_id: user.user_id,
    })
    setBusy(null)
    if (error) {
      toast.error('Deblokkeren is niet gelukt', { description: error.message })
      return
    }
    setUsers((current) => current?.filter((u) => u.user_id !== user.user_id) ?? null)
    toast.success(`${user.display_name} is gedeblokkeerd`)
  }

  if (!users || users.length === 0) return null

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <p className="mb-3 text-sm font-semibold text-ink">Geblokkeerde spelers</p>
      <ul className="space-y-2">
        {users.map((user) => (
          <li key={user.user_id} className="flex items-center gap-3">
            <Link href={`/u/${user.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={user.avatar_url} name={user.display_name} size="md" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{user.display_name}</span>
                <span className="block truncate text-xs text-ink-muted">@{user.username}</span>
              </span>
            </Link>
            <Button
              variant="soft"
              size="sm"
              loading={busy === user.user_id}
              onClick={() => void unblock(user)}
            >
              Deblokkeren
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
