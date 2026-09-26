import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ChevronLeft, Lock } from 'lucide-react'
import { PageTransition } from '@/components/layout/page-transition'
import { ProfileHeader } from '@/components/profile/profile-header'
import { AchievementPreview } from '@/components/profile/achievement-preview'
import { FriendActionButton } from '@/components/profile/friend-action-button'
import { ScoreEntryCard } from '@/components/score/score-entry-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { ProfileSafety } from '@/components/profile/profile-safety'
import { getCurrentUser, getPublicProfile } from '@/lib/supabase/queries'
import { formatPlayedAt } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  const profile = (await getPublicProfile(username))?.profile
  if (!profile) return { title: 'Profiel niet gevonden' }

  return {
    title: `${profile.display_name} (@${profile.username})`,
    description: `Bekijk de Yahtzee-statistieken, records en achievements van ${profile.display_name} op Snatzee.`,
  }
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  // One RPC, shared with the iOS app: the profile, the viewer's relation
  // to it, and only as much detail as that relation allows.
  const page = await getPublicProfile(username)
  if (!page) notFound()

  const viewer = await getCurrentUser()
  const { profile, is_self: isSelf, friendship, stats, achievements } = page
  const friendCount = page.friend_count
  const locked = !page.can_view_details
  const blockedByMe = page.blocked_by_me
  const scores = page.recent_scores

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[34rem]">
      <main id="main" className="safe-x pb-16">
        <PageTransition>
          <div
            className="flex items-center justify-between px-5 pb-4"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
          >
            <Link
              href={viewer ? '/app/rankings' : '/'}
              aria-label="Terug"
              className="press grid size-11 place-items-center rounded-full bg-surface text-ink ring-1 ring-hairline shadow-soft"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </Link>
            {!viewer && (
              <Button asChild size="sm">
                <Link href="/register">Maak je eigen Snatzee</Link>
              </Button>
            )}
          </div>

          <div className="space-y-6">
            <ProfileHeader
              displayName={profile.display_name}
              username={profile.username}
              avatarUrl={profile.avatar_url}
              bio={profile.bio}
              stats={stats}
              friendCount={friendCount}
              action={
                isSelf ? (
                  <Button asChild variant="soft" full size="sm">
                    <Link href="/app/profile">Naar je eigen profiel</Link>
                  </Button>
                ) : viewer && blockedByMe ? (
                  <Button variant="soft" full size="sm" disabled>
                    Geblokkeerd
                  </Button>
                ) : viewer ? (
                  <FriendActionButton
                    userId={profile.id}
                    displayName={profile.display_name}
                    status={friendship?.status ?? null}
                    friendshipId={friendship?.id ?? null}
                    isIncoming={friendship?.is_incoming ?? false}
                  />
                ) : (
                  <Button asChild variant="soft" full size="sm">
                    <Link href="/login">Log in om vrienden te worden</Link>
                  </Button>
                )
              }
            />

            {locked ? (
              <div className="px-5">
                <EmptyState
                  emoji="🔒"
                  title={blockedByMe ? 'Je hebt deze speler geblokkeerd' : 'Dit profiel is privé'}
                  description={
                    blockedByMe
                      ? `Deblokkeer ${profile.display_name} om het profiel weer te zien.`
                      : `${profile.display_name} deelt de details alleen met vrienden. De cijfers hierboven blijven zichtbaar in de ranglijsten.`
                  }
                />
              </div>
            ) : (
              <>
                <AchievementPreview
                  achievements={achievements}
                  showLink={false}
                />

                <section aria-labelledby="public-recent" className="px-5">
                  <h2
                    id="public-recent"
                    className="mb-3 text-lg font-extrabold tracking-tight text-ink"
                  >
                    Laatste potjes
                  </h2>

                  {scores.length === 0 ? (
                    <div className="rounded-[1.5rem] bg-surface p-6 text-center ring-1 ring-hairline shadow-soft">
                      <p className="text-sm text-ink-muted">
                        {profile.display_name} heeft nog geen potjes geregistreerd.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scores.map((score, index) => (
                        <div key={score.id}>
                          {(index === 0 ||
                            formatPlayedAt(score.played_at) !==
                              formatPlayedAt(scores[index - 1]!.played_at)) && (
                            <p className="mb-2 mt-3 px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">
                              {formatPlayedAt(score.played_at)}
                            </p>
                          )}
                          <ScoreEntryCard
                            entry={{
                              ...score,
                              note: null,
                              // Public profiles show the result, not the
                              // per-game detail or the private note.
                              yahtzee_count: 0,
                              sheet: null,
                              updated_at: score.created_at,
                            }}
                            index={index}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {viewer && !isSelf && (
              <ProfileSafety
                userId={profile.id}
                displayName={profile.display_name}
                blockedByMe={blockedByMe}
              />
            )}

            {!viewer && (
              <section className="px-5 pt-4">
                <div className="rounded-[1.75rem] bg-surface-elevated p-6 text-center text-white shadow-lift">
                  <Lock className="mx-auto size-6 text-mint-400" aria-hidden />
                  <h2 className="mt-3 text-xl font-black tracking-tight">Ook je scores bijhouden?</h2>
                  <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-ink-muted">
                    Snatzee houdt je records, statistieken en achievements bij. Gratis.
                  </p>
                  <Button asChild full className="mt-5">
                    <Link href="/register">Account maken</Link>
                  </Button>
                </div>
              </section>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  )
}
