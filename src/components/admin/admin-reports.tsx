'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Eraser, Flag, X } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/skeleton'
import { Segmented } from '@/components/ui/segmented'
import { BottomSheet } from '@/components/ui/sheet'
import { ToggleRow } from '@/components/ui/toggle-row'
import { REPORT_REASONS } from '@/components/profile/profile-safety'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { formatPlayedAt, formatTime } from '@/lib/utils'
import { haptic } from '@/lib/haptics'

/**
 * Reports players sent about each other, and what to do about them.
 *
 * The App Store asks for a way to act on reported content "in a timely
 * manner"; this is that way. Upholding a report can clear what the player
 * chose to show (avatar, bio, display name); a group can be removed from
 * the Groepen tab.
 */

type Status = 'OPEN' | 'RESOLVED' | 'DISMISSED'

interface ReportRow {
  id: string
  reason: (typeof REPORT_REASONS)[number]['key'] | 'OFFENSIVE_GROUP'
  details: string | null
  status: Status
  created_at: string
  reporter_username: string | null
  target_user_id: string | null
  target_username: string | null
  target_display_name: string | null
  target_avatar_url: string | null
  target_bio: string | null
  target_group_id: string | null
  target_group_name: string | null
  resolution_note: string | null
}

const reasonLabel = (reason: ReportRow['reason']) =>
  REPORT_REASONS.find((r) => r.key === reason)?.label ??
  (reason === 'OFFENSIVE_GROUP' ? 'Aanstootgevende groep' : reason)

export function AdminReports() {
  const [status, setStatus] = useState<'OPEN' | 'CLOSED'>('OPEN')
  const [result, setResult] = useState<{ key: string; rows: ReportRow[] } | null>(null)
  const [version, setVersion] = useState(0)
  const [moderating, setModerating] = useState<ReportRow | null>(null)
  const [clear, setClear] = useState({ avatar: false, bio: false, name: false })
  const [busy, setBusy] = useState(false)

  const key = `${status}|${version}`

  useEffect(() => {
    let cancelled = false
    getSupabaseBrowserClient()
      .rpc('admin_list_reports', { p_status: status === 'OPEN' ? 'OPEN' : null })
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (cancelled) return
        if (error) toast.error('Meldingen laden is niet gelukt', { description: error.message })
        const rows = ((data as ReportRow[] | null) ?? []).filter((row) =>
          status === 'OPEN' ? row.status === 'OPEN' : row.status !== 'OPEN',
        )
        setResult({ key, rows })
      })
    return () => {
      cancelled = true
    }
  }, [status, key])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  async function resolve(row: ReportRow, next: Exclude<Status, 'OPEN'>, note?: string) {
    const { error } = await getSupabaseBrowserClient().rpc('admin_resolve_report', {
      p_id: row.id,
      p_status: next,
      p_note: note ?? null,
    })
    if (error) {
      toast.error('Afhandelen is niet gelukt', { description: error.message })
      return false
    }
    haptic('success')
    toast.success(next === 'RESOLVED' ? 'Melding afgehandeld' : 'Melding afgewezen')
    refresh()
    return true
  }

  async function moderate() {
    if (!moderating?.target_user_id || busy) return
    setBusy(true)
    const { error } = await getSupabaseBrowserClient().rpc('admin_moderate_profile', {
      p_user_id: moderating.target_user_id,
      p_clear_avatar: clear.avatar,
      p_clear_bio: clear.bio,
      p_reset_display_name: clear.name,
    })
    if (error) {
      setBusy(false)
      toast.error('Opschonen is niet gelukt', { description: error.message })
      return
    }
    const cleared = [clear.avatar && 'profielfoto', clear.bio && 'bio', clear.name && 'naam']
      .filter(Boolean)
      .join(', ')
    await resolve(moderating, 'RESOLVED', cleared ? `Opgeschoond: ${cleared}` : undefined)
    setBusy(false)
    setModerating(null)
  }

  const rows = result?.key === key ? result.rows : null

  return (
    <div className="space-y-4 px-5">
      <Segmented
        ariaLabel="Status"
        layoutId="admin-report-status"
        options={[
          { key: 'OPEN', label: 'Open' },
          { key: 'CLOSED', label: 'Afgehandeld' },
        ]}
        value={status}
        onChange={setStatus}
      />

      {rows === null ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          emoji="🛡️"
          title={status === 'OPEN' ? 'Geen open meldingen' : 'Nog niets afgehandeld'}
          description="Meldingen van spelers over elkaar komen hier binnen."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-2xl bg-surface p-4 ring-1 ring-hairline">
              <div className="flex items-start gap-3">
                {row.target_user_id ? (
                  <Avatar src={row.target_avatar_url} name={row.target_display_name ?? '?'} size="md" />
                ) : (
                  <span className="grid size-11 place-items-center rounded-full bg-surface-elevated">
                    <Flag className="size-5 text-ink-muted" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-tangerine-300">
                    {reasonLabel(row.reason)}
                  </p>
                  {row.target_username ? (
                    <Link href={`/u/${row.target_username}`} className="block truncate font-bold text-ink">
                      {row.target_display_name} · @{row.target_username}
                    </Link>
                  ) : (
                    <p className="truncate font-bold text-ink">Groep: {row.target_group_name ?? '—'}</p>
                  )}
                  {row.target_bio && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-soft">Bio: {row.target_bio}</p>
                  )}
                  {row.details && <p className="mt-2 text-sm text-ink">“{row.details}”</p>}
                  <p className="mt-2 text-xs text-ink-muted">
                    Gemeld door @{row.reporter_username ?? 'verwijderd account'} ·{' '}
                    {formatPlayedAt(row.created_at)} {formatTime(row.created_at)}
                  </p>
                  {row.status !== 'OPEN' && (
                    <p className="mt-1 text-xs text-ink-muted">
                      {row.status === 'RESOLVED' ? 'Afgehandeld' : 'Afgewezen'}
                      {row.resolution_note ? ` · ${row.resolution_note}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {row.status === 'OPEN' && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Button
                    variant="soft"
                    size="sm"
                    disabled={!row.target_user_id}
                    onClick={() => {
                      setClear({
                        avatar: row.reason === 'OFFENSIVE_AVATAR',
                        bio: row.reason === 'OFFENSIVE_BIO',
                        name: row.reason === 'OFFENSIVE_NAME',
                      })
                      setModerating(row)
                    }}
                  >
                    <Eraser className="size-4" aria-hidden />
                    Opschonen
                  </Button>
                  <Button variant="soft" size="sm" onClick={() => void resolve(row, 'RESOLVED')}>
                    <Check className="size-4" aria-hidden />
                    Klaar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void resolve(row, 'DISMISSED')}>
                    <X className="size-4" aria-hidden />
                    Afwijzen
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={moderating !== null}
        onOpenChange={(open) => !open && !busy && setModerating(null)}
        title="Profiel opschonen"
        description={`Wat moet er weg bij ${moderating?.target_display_name ?? 'deze speler'}? De melding wordt daarna afgehandeld.`}
        footer={
          <Button
            full
            size="lg"
            variant="danger"
            loading={busy}
            disabled={busy || (!clear.avatar && !clear.bio && !clear.name)}
            onClick={() => void moderate()}
          >
            Opschonen en afhandelen
          </Button>
        }
      >
        <div className="space-y-3 pb-2">
          <ToggleRow
            label="Profielfoto verwijderen"
            checked={clear.avatar}
            onCheckedChange={(avatar) => setClear((c) => ({ ...c, avatar }))}
          />
          <ToggleRow
            label="Bio leegmaken"
            checked={clear.bio}
            onCheckedChange={(bio) => setClear((c) => ({ ...c, bio }))}
          />
          <ToggleRow
            label="Weergavenaam terugzetten naar username"
            checked={clear.name}
            onCheckedChange={(name) => setClear((c) => ({ ...c, name }))}
          />
        </div>
      </BottomSheet>
    </div>
  )
}
