import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { QuickActionsProvider } from '@/components/layout/quick-actions-provider'
import { BottomNavigation } from '@/components/layout/bottom-navigation'
import { PwaPrompts } from '@/components/pwa/pwa-prompts'
import { PullToRefresh } from '@/components/layout/pull-to-refresh'
import { LaunchSplash } from '@/components/layout/launch-splash'
import {
  getAppSettings,
  getCurrentProfile,
  getCurrentUser,
  getPendingFriendRequestCount,
} from '@/lib/supabase/queries'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await getCurrentProfile()
  if (!profile?.onboarding_completed) redirect('/onboarding')

  // Drives the badge on the Vrienden tab. Read here so it is correct on
  // first paint and refreshed by router.refresh() after accepting one.
  const [friendRequests, appSettings] = await Promise.all([
    getPendingFriendRequestCount(),
    getAppSettings(),
  ])

  return (
    <Suspense fallback={null}>
      <QuickActionsProvider>
        {/* Centred mobile-width column: a phone app on a phone, a focused
            card on a desktop screen. */}
        <div className="mx-auto min-h-dvh w-full max-w-[34rem]">
          <main id="main" className="pb-nav safe-x">
            {children}
          </main>
        </div>
        {/* Sits above the column so the indicator is not clipped by it. */}
        <PullToRefresh />
        {appSettings.launch_splash === 1 && <LaunchSplash />}
        <BottomNavigation friendRequests={friendRequests} />
        {/* Install / notification nudges — signed-in only, so the first thing a
            new visitor sees is the app itself. */}
        <PwaPrompts />
      </QuickActionsProvider>
    </Suspense>
  )
}
