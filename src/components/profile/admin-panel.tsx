'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { ToggleRow } from '@/components/ui/toggle-row'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import type { AppRole } from '@/types/database'

const TUNABLE = [
  {
    key: 'min_games_for_average_ranking',
    label: 'Minimum potjes voor gemiddelde-ranking',
    hint: 'Voorkomt dat iemand met één potje bovenaan staat.',
  },
  { key: 'min_score', label: 'Laagst toegestane score', hint: null },
  { key: 'max_score', label: 'Hoogst toegestane score', hint: null },
] as const

/**
 * Only rendered for admins. Exposes the values in `app_settings` that the
 * rankings and validation read, plus role assignment for superadmins.
 */
export function AdminPanel({
  role,
  settings,
}: {
  role: AppRole
  settings: Record<string, number>
}) {
  const router = useRouter()
  const usernameId = useId()
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TUNABLE.map((t) => [t.key, String(settings[t.key] ?? '')])),
  )
  const [savingKey, setSavingKey] = useState<string | null>(null)

  // Stored as 0/1 so the existing integer RPC can write it.
  const [launchSplash, setLaunchSplash] = useState(() => settings.launch_splash === 1)
  const [splashBusy, setSplashBusy] = useState(false)

  const [scan, setScan] = useState(() => settings.scoresheet_scan === 1)
  const [scanBusy, setScanBusy] = useState(false)

  const [targetUser, setTargetUser] = useState('')
  const [targetRole, setTargetRole] = useState<AppRole>('admin')
  const [assigning, setAssigning] = useState(false)

  async function saveSetting(key: string, label: string) {
    const parsed = Number.parseInt(values[key] ?? '', 10)
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error('Vul een geldig getal in')
      return
    }

    setSavingKey(key)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('update_app_setting', { p_key: key, p_value: parsed })
    setSavingKey(null)

    if (error) {
      toast.error('Opslaan is niet gelukt', { description: error.message })
      return
    }

    haptic('success')
    toast.success(`${label} bijgewerkt`)
    router.refresh()
  }

  /**
   * Both switches below write a 0/1 flag through the same RPC, so they
   * share one function rather than two that drift apart. The switch moves
   * first and is put back if the write fails, so it never shows a state
   * the database is not in.
   */
  async function toggleFlag(
    key: string,
    next: boolean,
    apply: (value: boolean) => void,
    setBusy: (busy: boolean) => void,
    labels: { on: string; off: string },
  ) {
    setBusy(true)
    apply(next)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('update_app_setting', { p_key: key, p_value: next ? 1 : 0 })
    setBusy(false)

    if (error) {
      apply(!next)
      toast.error('Opslaan is niet gelukt', { description: error.message })
      return
    }

    haptic('success')
    toast.success(next ? labels.on : labels.off)
    router.refresh()
  }

  async function assignRole(event: React.FormEvent) {
    event.preventDefault()
    if (assigning || !targetUser.trim()) return

    setAssigning(true)
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.rpc('set_user_role', {
      p_username: targetUser.trim().toLowerCase(),
      p_role: targetRole,
    })
    setAssigning(false)

    if (error) {
      toast.error('Rol toekennen is niet gelukt', { description: error.message })
      return
    }

    haptic('success')
    toast.success(`@${targetUser.trim().toLowerCase()} is nu ${targetRole}`)
    setTargetUser('')
    router.refresh()
  }

  return (
    <section className="rounded-[1.75rem] bg-surface-elevated p-5 text-white shadow-lift">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-mint-400">
        <ShieldCheck className="size-4" aria-hidden strokeWidth={2.4} />
        Beheer
      </h2>
      <p className="mb-5 text-sm text-ink-muted">
        Je bent ingelogd als <strong className="font-semibold text-white">{role}</strong>.
      </p>

      <div className="space-y-5">
        {TUNABLE.map((setting) => (
          <div key={setting.key}>
            <Label htmlFor={setting.key} className="text-ink-soft">
              {setting.label}
            </Label>
            <div className="flex gap-2">
              <Input
                id={setting.key}
                type="number"
                inputMode="numeric"
                min={0}
                value={values[setting.key] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [setting.key]: e.target.value }))
                }
                className="bg-surface/10 text-white ring-white/20 placeholder:text-ink-muted focus:bg-surface/15"
              />
              <Button
                variant="primary"
                loading={savingKey === setting.key}
                onClick={() => saveSetting(setting.key, setting.label)}
              >
                Opslaan
              </Button>
            </div>
            {setting.hint && <p className="mt-1.5 text-xs text-ink-muted">{setting.hint}</p>}
          </div>
        ))}

        <div className="space-y-5 border-t border-white/10 pt-5">
          <ToggleRow
            label="Startscherm bij openen"
            description="Toont bij het openen een tik-scherm, zodat het openingsgeluid meteen speelt in plaats van bij de eerste aanraking. Verschijnt alleen wanneer het geluid niet vanzelf mag spelen."
            checked={launchSplash}
            disabled={splashBusy}
            onCheckedChange={(next) =>
              void toggleFlag('launch_splash', next, setLaunchSplash, setSplashBusy, {
                on: 'Startscherm staat aan',
                off: 'Startscherm staat uit',
              })
            }
          />

          <ToggleRow
            label="Scoreblad scannen"
            description="Zet in 'Potje toevoegen' de optie aan om een foto van het papieren scoreblad te maken en de scores automatisch te laten lezen. Nog in ontwikkeling."
            checked={scan}
            disabled={scanBusy}
            onCheckedChange={(next) =>
              void toggleFlag('scoresheet_scan', next, setScan, setScanBusy, {
                on: 'Scoreblad scannen staat aan',
                off: 'Scoreblad scannen staat uit',
              })
            }
          />
        </div>

        {role === 'superadmin' && (
          <form onSubmit={assignRole} className="border-t border-white/10 pt-5">
            <Label htmlFor={usernameId} className="text-ink-soft">
              Rol toekennen
            </Label>
            <div className="flex gap-2">
              <Input
                id={usernameId}
                value={targetUser}
                onChange={(e) => setTargetUser(e.target.value.toLowerCase())}
                placeholder="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="bg-surface/10 text-white ring-white/20 placeholder:text-ink-muted focus:bg-surface/15"
              />
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as AppRole)}
                aria-label="Rol"
                className="min-h-12 rounded-2xl bg-surface/10 px-3 font-semibold text-white ring-1 ring-white/20 focus:outline-none"
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="superadmin">superadmin</option>
              </select>
            </div>
            <Button type="submit" variant="primary" full className="mt-3" loading={assigning}>
              Toekennen
            </Button>
          </form>
        )}
      </div>
    </section>
  )
}
