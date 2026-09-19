import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { PageTransition } from '@/components/layout/page-transition'
import { AdminConsole } from '@/components/admin/admin-console'
import { getCurrentProfile } from '@/lib/supabase/queries'

export const metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const profile = await getCurrentProfile()

  // Convenience only — the real boundary is in the database, where every
  // admin RPC checks is_superadmin() before returning a row.
  if (!profile) redirect('/login')
  if (profile.role !== 'superadmin') redirect('/app')

  return (
    <PageTransition>
      <div style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}>
        <PageHeader
          title="Snatzee Admin"
          subtitle="Beheer scores en Yahtzee-registraties"
          backHref="/app/settings"
        />
      </div>

      <AdminConsole />
    </PageTransition>
  )
}
