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
import {
  getAchievementsForUser,
  getCurrentUser,
  getProfileByUsername,
  getPublicScores,
  getUserStatistics,
} from '@/lib/supabase/queries'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatPlayedAt } from '@/lib/utils'
import type { Friendship } from '@/types/database'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  const profile = await getProfileByUsername(username)
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
  const profile = await getProfileByUsername(username)
  if (!profile || !profile.onboarding_completed) notFound()

  const viewer = await getCurrentUser()
  const isSelf = viewer?.id === profile.id

  // Friendship state drives both the action button and private-profile access.
  type FriendshipRow = Pick<Friendship, 'id' | 'status' | 'requester_id' | 'addressee_id'>
  let friendship: FriendshipRow | null = null
  if (viewer && !isSelf) {
    const supabase = await createSupabaseServerClient()
    const { data } = await supabase
      .from('friendships')
      .select('id, status, requester_id, addressee_id')
      .or(
        `and(requester_id.eq.${viewer.id},addressee_id.eq.${profile.id}),and(requester_id.eq.${profile.id},addressee_id.eq.${viewer.id})`,
      )
      .maybeSingle()
    friendship = (data as FriendshipRow | null) ?? null
  }

  const areFriends = friendship?.status === 'accepted'
  const locked = profile.is_private && !isSelf && !areFriends

  const [stats, achievements, scores] = await Promise.all([
    getUserStatistics(profile.id),
    locked ? Promise.resolve([]) : getAchievementsForUser(profile.id),
    locked ? Promise.resolve([]) : getPublicScores(profile.id, 10),
  ])

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
              className="press grid size-11 place-items-center rounded-full bg-white text-navy-900 ring-1 ring-navy-100 shadow-soft"
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
              bio={locked ? null : profile.bio}
              stats={stats}
              action={
                isSelf ? (
                  <Button asChild variant="soft" full size="sm">
                    <Link href="/app/profile">Naar je eigen profiel</Link>
                  </Button>
                ) : viewer ? (
                  <FriendActionButton
                    userId={profile.id}
                    displayName={profile.display_name}
                    status={friendship?.status ?? null}
                    friendshipId={friendship?.id ?? null}
                    isIncoming={friendship?.addressee_id === viewer.id}
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
                  title="Dit profiel is privé"
                  description={`${profile.display_name} deelt de details alleen met vrienden. De cijfers hierboven blijven zichtbaar in de ranglijsten.`}
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
                    className="mb-3 text-lg font-extrabold tracking-tight text-navy-900"
                  >
                    Laatste potjes
                  </h2>

                  {scores.length === 0 ? (
                    <div className="rounded-[1.5rem] bg-white p-6 text-center ring-1 ring-navy-100/70 shadow-soft">
                      <p className="text-sm text-navy-300">
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
                            <p className="mb-2 mt-3 px-1 text-xs font-bold uppercase tracking-wider text-navy-300">
                              {formatPlayedAt(score.played_at)}
                            </p>
                          )}
                          <ScoreEntryCard
                            entry={{
                              ...score,
                              note: null,
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

            {!viewer && (
              <section className="px-5 pt-4">
                <div className="rounded-[1.75rem] bg-navy-900 p-6 text-center text-white shadow-lift">
                  <Lock className="mx-auto size-6 text-mint-400" aria-hidden />
                  <h2 className="mt-3 text-xl font-black tracking-tight">Ook je scores bijhouden?</h2>
                  <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-navy-300">
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
