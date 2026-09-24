'use client'

import { useState } from 'react'
import { Share2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { haptic } from '@/lib/haptics'

/**
 * Invites someone who is not on Snatzee yet.
 *
 * Uses the platform share sheet where there is one, which on a phone is
 * what people actually want — it puts WhatsApp, Messages and the rest one
 * tap away. Desktop browsers mostly have no navigator.share, so there the
 * message goes to the clipboard instead and the toast says so.
 */

/**
 * The canonical address, not the one in the address bar.
 *
 * An invite should send people to the domain the app is meant to live on,
 * even when it was sent from one of the others.
 */
function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/+$/, '')
  return typeof window === 'undefined' ? '' : window.location.origin
}

export function inviteMessage(username: string) {
  return (
    `${username} wil je uitnodigen om de Snatzee app te gebruiken! ` +
    `Open de app via ${siteUrl()}, registreer je account en voeg de app toe ` +
    `aan je homescreen om te joinen!`
  )
}

export function InviteOutsider({ username }: { username: string }) {
  const [busy, setBusy] = useState(false)

  async function share() {
    haptic('light')
    const text = inviteMessage(username)

    if (typeof navigator !== 'undefined' && navigator.share) {
      setBusy(true)
      try {
        await navigator.share({ title: 'Snatzee', text })
      } catch {
        // AbortError is what a cancelled share sheet throws, and that is
        // not a failure worth reporting.
      } finally {
        setBusy(false)
      }
      return
    }

    try {
      await navigator.clipboard.writeText(text)
      toast.success('Uitnodiging gekopieerd', { description: 'Plak hem in een bericht.' })
    } catch {
      toast.info(text)
    }
  }

  return (
    <section className="card-surface rounded-[1.5rem] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-grape-500/15 text-grape-300">
          <UserPlus className="size-5" strokeWidth={2.4} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold tracking-tight text-ink">Speelt iemand nog geen Snatzee?</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Stuur ze een uitnodiging met een link naar de app.
          </p>
          <Button size="sm" variant="soft" className="mt-3" loading={busy} onClick={share}>
            <Share2 className="size-4" aria-hidden />
            Uitnodiging delen
          </Button>
        </div>
      </div>
    </section>
  )
}
