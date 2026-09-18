'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import type { FriendshipStatus } from '@/types/database'

export function FriendActionButton({
  userId,
  displayName,
  status,
  friendshipId,
  isIncoming,
}: {
  userId: string
  displayName: string
  status: FriendshipStatus | null
  friendshipId: string | null
  isIncoming: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [localStatus, setLocalStatus] = useState(status)

  if (localStatus === 'accepted') {
    return (
      <span className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white/10 text-sm font-semibold text-mint-400 ring-1 ring-white/20">
        <Check className="size-4" aria-hidden strokeWidth={3} />
        Vrienden
      </span>
    )
  }

  if (localStatus === 'pending' && !isIncoming) {
    return (
      <span className="flex min-h-12 w-full items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-navy-300 ring-1 ring-white/20">
        Verzoek verzonden
      </span>
    )
  }

  async function handleClick() {
    if (pending) return
    setPending(true)

    const supabase = getSupabaseBrowserClient()
    const { error } =
      localStatus === 'pending' && isIncoming && friendshipId
        ? await supabase.rpc('respond_friend_request', { p_id: friendshipId, p_accept: true })
        : await supabase.rpc('send_friend_request', { p_user_id: userId })

    setPending(false)

    if (error) {
      toast.error('Er ging iets mis', { description: error.message })
      return
    }

    haptic('success')
    if (localStatus === 'pending' && isIncoming) {
      setLocalStatus('accepted')
      toast.success(`Jullie zijn nu vrienden 🎉`)
    } else {
      setLocalStatus('pending')
      toast.success('Vriendverzoek verzonden', { description: `Naar ${displayName}` })
    }
    router.refresh()
  }

  return (
    <Button full loading={pending} onClick={handleClick}>
      {localStatus === 'pending' && isIncoming ? (
        <>
          <Check className="size-4" aria-hidden />
          Verzoek accepteren
        </>
      ) : (
        <>
          <UserPlus className="size-4" aria-hidden />
          Vriend toevoegen
        </>
      )}
    </Button>
  )
}
