'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { BottomSheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label, Textarea } from '@/components/ui/input'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

export const REPORT_REASONS = [
  { key: 'OFFENSIVE_NAME', label: 'Aanstootgevende naam' },
  { key: 'OFFENSIVE_AVATAR', label: 'Aanstootgevende profielfoto' },
  { key: 'OFFENSIVE_BIO', label: 'Aanstootgevende bio' },
  { key: 'CHEATING', label: 'Valsspelen met scores' },
  { key: 'HARASSMENT', label: 'Intimidatie of pesten' },
  { key: 'SPAM', label: 'Spam' },
  { key: 'OTHER', label: 'Iets anders' },
] as const

type ReportReason = (typeof REPORT_REASONS)[number]['key']

/**
 * Report and block, on someone else's profile.
 *
 * Every app with content made by its users needs both before the App
 * Store takes it (guideline 1.2), and they are worth having regardless:
 * a report reaches the admins, a block takes the other person out of your
 * search, rankings and notifications and ends any friendship.
 */
export function ProfileSafety({
  userId,
  displayName,
  blockedByMe,
}: {
  userId: string
  displayName: string
  blockedByMe: boolean
}) {
  const router = useRouter()
  const [reportOpen, setReportOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)

  async function sendReport() {
    if (!reason || sending) return
    setSending(true)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('report_content', {
      p_reason: reason,
      p_target_user_id: userId,
      p_details: details.trim() || null,
    })
    setSending(false)

    if (error) {
      toast.error('Melden is niet gelukt', { description: error.message })
      return
    }
    haptic('success')
    toast.success('Bedankt voor je melding', {
      description: 'Een beheerder kijkt ernaar.',
    })
    setReportOpen(false)
    setReason(null)
    setDetails('')
  }

  async function toggleBlock() {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc(blockedByMe ? 'unblock_user' : 'block_user', {
      p_user_id: userId,
    })
    if (error) {
      toast.error('Dat is niet gelukt', { description: error.message })
      return
    }
    haptic(blockedByMe ? 'light' : 'warning')
    toast.success(blockedByMe ? `${displayName} is gedeblokkeerd` : `${displayName} is geblokkeerd`)
    setBlockOpen(false)
    router.refresh()
  }

  return (
    <section className="px-5">
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={() => setReportOpen(true)}>
          <Flag className="size-4" aria-hidden />
          Melden
        </Button>
        <Button
          variant={blockedByMe ? 'soft' : 'ghost'}
          size="sm"
          className="flex-1"
          onClick={() => (blockedByMe ? void toggleBlock() : setBlockOpen(true))}
        >
          <Ban className="size-4" aria-hidden />
          {blockedByMe ? 'Deblokkeren' : 'Blokkeren'}
        </Button>
      </div>

      <ConfirmDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={`${displayName} blokkeren?`}
        description="Jullie zien elkaar niet meer in zoeken, ranglijsten en meldingen, en een vriendschap of openstaand verzoek vervalt. Je kunt dit later ongedaan maken in Instellingen."
        confirmLabel="Blokkeren"
        destructive
        onConfirm={toggleBlock}
      />

      <BottomSheet
        open={reportOpen}
        onOpenChange={(next) => !sending && setReportOpen(next)}
        title={`${displayName} melden`}
        description="Wat is er mis? Een beheerder bekijkt elke melding."
        footer={
          <Button full size="lg" disabled={!reason || sending} loading={sending} onClick={sendReport}>
            Melding versturen
          </Button>
        }
      >
        <div className="space-y-4 pb-2">
          <div className="grid gap-2" role="radiogroup" aria-label="Reden">
            {REPORT_REASONS.map((option) => (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={reason === option.key}
                onClick={() => setReason(option.key)}
                className={cn(
                  'press min-h-12 rounded-2xl px-4 text-left text-[0.95rem] font-semibold ring-1',
                  reason === option.key
                    ? 'bg-mint-500/15 text-mint-300 ring-mint-500/40'
                    : 'bg-surface text-ink-soft ring-hairline',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="report-details">
              Toelichting <span className="font-normal text-ink-muted">(optioneel)</span>
            </Label>
            <Textarea
              id="report-details"
              value={details}
              maxLength={500}
              onChange={(event) => setDetails(event.target.value)}
            />
          </div>
        </div>
      </BottomSheet>
    </section>
  )
}
