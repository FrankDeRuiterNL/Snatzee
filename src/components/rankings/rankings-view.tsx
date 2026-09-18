'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { LeaderboardRow } from '@/components/rankings/leaderboard-row'
import { ChipScroller, Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { ListSkeleton } from '@/components/ui/skeleton'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  LEADERBOARD_METRICS,
  LEADERBOARD_SCOPES,
  type LeaderboardMetric,
  type LeaderboardScope,
} from '@/lib/constants'
import type { LeaderboardRow as Row } from '@/types/database'

export function RankingsView({
  groups,
  minGamesForAverage,
  initialScope = 'global',
  initialGroupId = null,
  lockedScope = false,
}: {
  groups: { id: string; name: string; emoji: string | null }[]
  minGamesForAverage: number
  initialScope?: LeaderboardScope
  initialGroupId?: string | null
  lockedScope?: boolean
}) {
  const [metric, setMetric] = useState<LeaderboardMetric>('highest_score')
  const [scope, setScope] = useState<LeaderboardScope>(initialScope)
  const [groupId, setGroupId] = useState<string | null>(initialGroupId ?? groups[0]?.id ?? null)

  // The result is tagged with the query it belongs to, so "still loading" is
  // derived rather than written from inside the effect.
  const [result, setResult] = useState<{ key: string; rows: Row[]; error: string | null } | null>(
    null,
  )

  const queryKey = `${metric}|${scope}|${scope === 'group' ? groupId : ''}`

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (scope === 'group' && !groupId) {
        if (!cancelled) setResult({ key: queryKey, rows: [], error: null })
        return
      }

      const supabase = getSupabaseBrowserClient()
      const { data, error: rpcError } = await supabase.rpc('get_leaderboard', {
        p_metric: metric,
        p_scope: scope,
        p_group_id: scope === 'group' ? groupId : null,
        p_limit: 50,
      })

      if (cancelled) return
      setResult({
        key: queryKey,
        rows: rpcError ? [] : ((data as Row[] | null) ?? []),
        error: rpcError?.message ?? null,
      })
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [metric, scope, groupId, queryKey])

  const loaded = result?.key === queryKey ? result : null
  const rows = loaded?.rows ?? null
  const error = loaded?.error ?? null

  const config = LEADERBOARD_METRICS.find((m) => m.key === metric)!
  const visible = rows?.slice(0, 50) ?? []
  const me = rows?.find((r) => r.is_current_user)
  // Pin the current user to the bottom when they fall outside the visible top.
  const showStickyMe = me !== undefined && !visible.some((r) => r.is_current_user && r.rank <= 50)

  return (
    <div className="space-y-4">
      {!lockedScope && (
        <div className="px-5">
          <Segmented
            ariaLabel="Ranglijst bereik"
            layoutId="rankings-scope"
            options={LEADERBOARD_SCOPES.map((s) => ({
              ...s,
              disabled: s.key === 'group' && groups.length === 0,
            }))}
            value={scope}
            onChange={setScope}
          />
        </div>
      )}

      {!lockedScope && scope === 'group' && groups.length > 0 && (
        <div className="px-5">
          <ChipScroller
            ariaLabel="Kies een groep"
            options={groups.map((g) => ({ key: g.id, label: `${g.emoji ?? '🎲'} ${g.name}` }))}
            value={groupId ?? ''}
            onChange={setGroupId}
          />
        </div>
      )}

      <div className="px-5">
        <ChipScroller
          ariaLabel="Ranglijst categorie"
          options={LEADERBOARD_METRICS.map((m) => ({ key: m.key, label: m.label }))}
          value={metric}
          onChange={setMetric}
        />
      </div>

      <div className="px-5">
        <h2 className="text-lg font-extrabold tracking-tight text-navy-900">{config.title}</h2>
        {metric === 'average_score' && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-navy-300">
            <Info className="size-4 shrink-0" aria-hidden />
            Minimaal {minGamesForAverage} potjes nodig
          </p>
        )}
      </div>

      <div className="px-5">
        {rows === null ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <EmptyState
            emoji="⚠️"
            title="Ranglijst kon niet laden"
            description={error}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            emoji="🏆"
            title="Nog niets te ranken"
            description={
              scope === 'friends'
                ? 'Voeg vrienden toe om jullie cijfers naast elkaar te zien.'
                : scope === 'group'
                  ? 'Zodra groepsleden potjes registreren verschijnt hier de ranglijst.'
                  : 'Er zijn nog geen scores geregistreerd voor deze categorie.'
            }
          />
        ) : (
          <ol className="space-y-2">
            {visible.map((row, index) => (
              <li key={row.user_id}>
                <LeaderboardRow row={row} decimals={config.decimals ?? 0} index={index} />
              </li>
            ))}
          </ol>
        )}
      </div>

      {showStickyMe && me && (
        <div
          className="sticky z-30 px-5"
          style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <div className="rounded-[1.5rem] bg-cream-100/80 p-1 backdrop-blur">
            <LeaderboardRow row={me} decimals={config.decimals ?? 0} sticky />
          </div>
        </div>
      )}
    </div>
  )
}
