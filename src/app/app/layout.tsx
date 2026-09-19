import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { QuickActionsProvider } from '@/components/layout/quick-actions-provider'
import { BottomNavigation } from '@/components/layout/bottom-navigation'
import { PwaPrompts } from '@/components/pwa/pwa-prompts'
import { getCurrentProfile, getCurrentUser } from '@/lib/supabase/queries'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await getCurrentProfile()
  if (!profile?.onboarding_completed) redirect('/onboarding')

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
        <BottomNavigation />
        {/* Install / notification nudges — signed-in only, so the first thing a
            new visitor sees is the app itself. */}
        <PwaPrompts />
      </QuickActionsProvider>
    </Suspense>
  )
}
