'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bell,
  ChevronRight,
  Eye,
  LogOut,
  Palette,
  Shield,
  Trash2,
  UserCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BottomSheet } from '@/components/ui/sheet'
import { FieldError, Input, Label, Textarea } from '@/components/ui/input'
import { ToggleRow } from '@/components/ui/toggle-row'
import { AvatarUploader } from '@/components/profile/avatar-uploader'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { DISPLAY_NAME_MAX } from '@/lib/constants'
import { haptic } from '@/lib/haptics'
import { isSoundEnabled, playSound, setSoundEnabled } from '@/lib/audio'
import { disablePush, enablePush, hasLocalSubscription, isPushSupported } from '@/lib/push'
import { isStandalone } from '@/lib/pwa'
import type { Profile } from '@/types/database'

/**
 * Notification and appearance preferences are per-device conveniences, so they
 * live in localStorage rather than in the database.
 */
function readLocalPreference(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : stored === 'true'
  } catch {
    return fallback
  }
}

function writeLocalPreference(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value))
  } catch {
    // Private mode or blocked storage — preferences just do not persist.
  }
}

export function SettingsView({
  profile,
  email,
}: {
  profile: Profile
  email: string | null
}) {
  const router = useRouter()
  const displayNameId = useId()
  const bioId = useId()
  const confirmId = useId()

  const [editOpen, setEditOpen] = useState(false)
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [bio, setBio] = useState(profile.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [isPrivate, setIsPrivate] = useState(profile.is_private)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [celebrations, setCelebrations] = useState(() =>
    readLocalPreference('snatzee:celebrations', true),
  )
  const [hapticsOn, setHapticsOn] = useState(() => readLocalPreference('snatzee:haptics', true))
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled())
  const [reducedMotion, setReducedMotion] = useState(() =>
    readLocalPreference('snatzee:reduced-motion', false),
  )

  // Push state is read from the browser rather than stored: the permission
  // and the subscription both live outside the app and can be revoked from
  // the device settings without the app ever hearing about it.
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  // Resolved after mount: both answers depend on browser APIs the server
  // cannot see, and rendering a guess would not match the hydrated markup.
  const [pushSupport, setPushSupport] = useState<'unknown' | 'ready' | 'needs-install' | 'none'>(
    'unknown',
  )

  useEffect(() => {
    let cancelled = false

    const support = isPushSupported() ? 'ready' : isStandalone() ? 'none' : 'needs-install'

    hasLocalSubscription().then((active) => {
      if (cancelled) return
      setPushSupport(support)
      setPushOn(active)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  // On iOS push only exists once the app is on the homescreen, so saying so
  // is more use than a toggle that silently fails.
  const pushAvailable = pushSupport === 'ready'
  const pushDescription =
    pushSupport === 'needs-install'
      ? 'Zet Snatzee eerst op je beginscherm; meldingen werken alleen in de geïnstalleerde app.'
      : pushSupport === 'none'
        ? 'Dit toestel of deze browser ondersteunt geen meldingen.'
        : 'Een seintje bij vriendschapsverzoeken, verbroken records en nieuwe achievements.'

  async function togglePush(next: boolean) {
    if (pushBusy) return
    setPushBusy(true)

    if (next) {
      const result = await enablePush()
      setPushBusy(false)
      if (result.ok) {
        setPushOn(true)
        haptic('success')
        toast.success('Meldingen staan aan 🔔')
        return
      }
      toast.error(
        result.reason === 'denied'
          ? 'Meldingen zijn geblokkeerd. Zet ze aan in je apparaatinstellingen.'
          : 'Meldingen aanzetten is niet gelukt.',
      )
      return
    }

    const done = await disablePush()
    setPushBusy(false)
    if (done) {
      setPushOn(false)
      toast.success('Meldingen staan uit')
      return
    }
    toast.error('Meldingen uitzetten is niet gelukt.')
  }

  async function sendTestNotification() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      const response = await fetch('/api/push/test', { method: 'POST' })
      if (!response.ok) throw new Error('mislukt')
      const result = (await response.json()) as { sent: number }
      toast.success(
        result.sent > 0
          ? 'Testmelding verstuurd — hij komt zo binnen.'
          : 'Geen apparaten geregistreerd voor meldingen.',
      )
    } catch {
      toast.error('Testmelding sturen is niet gelukt.')
    } finally {
      setPushBusy(false)
    }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    if (displayName.trim().length === 0) {
      setError('Vul een weergavenaam in')
      return
    }

    setSaving(true)
    setError(null)

    const supabase = getSupabaseBrowserClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim().slice(0, DISPLAY_NAME_MAX),
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq('id', profile.id)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    haptic('success')
    toast.success('Profiel bijgewerkt ✓')
    setEditOpen(false)
    router.refresh()
  }

  async function togglePrivacy(next: boolean) {
    setIsPrivate(next)
    const supabase = getSupabaseBrowserClient()
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_private: next })
      .eq('id', profile.id)

    if (updateError) {
      setIsPrivate(!next)
      toast.error('Instelling opslaan is niet gelukt', { description: updateError.message })
      return
    }
    toast.success(next ? 'Je profiel is nu privé' : 'Je profiel is weer openbaar')
    router.refresh()
  }

  async function deleteAccount() {
    if (deleting) return
    setDeleting(true)

    const supabase = getSupabaseBrowserClient()

    // Avatars live in storage, outside what deleting the account cascades
    // to. Removed first, while there is still a session allowed to do it;
    // best effort, because a leftover file must not block the deletion.
    try {
      const bucket = supabase.storage.from('avatars')
      const { data: files } = await bucket.list(profile.id, { limit: 1000 })
      if (files?.length) await bucket.remove(files.map((file: { name: string }) => `${profile.id}/${file.name}`))
    } catch {
      // Carry on with the account itself.
    }

    const { error: rpcError } = await supabase.rpc('delete_own_account')

    if (rpcError) {
      setDeleting(false)
      toast.error('Verwijderen is niet gelukt', { description: rpcError.message })
      return
    }

    await supabase.auth.signOut()
    toast.success('Je account is verwijderd')
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="space-y-6 px-5">
      {profile.role === 'superadmin' && (
        <Link
          href="/app/admin"
          className="press card-elevated sheen flex items-center gap-4 rounded-[1.75rem] p-4"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mint-500/15 text-mint-300 ring-1 ring-mint-500/30">
            <Shield className="size-5" strokeWidth={2.4} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold tracking-tight text-ink">Admin</span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              Scores, meldingen en instellingen
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-muted" aria-hidden />
        </Link>
      )}

      <Section title="Account" icon={UserCog}>
        <Row label="E-mailadres" value={email ?? '—'} />
        <Row label="Username" value={`@${profile.username}`} />
        {profile.role !== 'user' && <Row label="Rol" value={profile.role} />}
        <Button variant="soft" full className="mt-2" onClick={() => setEditOpen(true)}>
          Profiel wijzigen
        </Button>
      </Section>

      <Section title="Privacy" icon={Eye}>
        <ToggleRow
          label="Privéprofiel"
          description="Verberg je profielpagina voor spelers die geen vriend zijn. Je blijft zichtbaar in ranglijsten."
          checked={isPrivate}
          onCheckedChange={togglePrivacy}
        />
      </Section>

      <Section title="Meldingen" icon={Bell}>
        <ToggleRow
          label="Celebrations"
          description="Toon de confetti en overlays bij Yahtzees en records."
          checked={celebrations}
          onCheckedChange={(next) => {
            setCelebrations(next)
            writeLocalPreference('snatzee:celebrations', next)
          }}
        />
        <ToggleRow
          label="Trillen"
          description="Haptische feedback bij knoppen, waar je toestel dat ondersteunt."
          checked={hapticsOn}
          onCheckedChange={(next) => {
            setHapticsOn(next)
            writeLocalPreference('snatzee:haptics', next)
          }}
        />
        <ToggleRow
          label="Geluid"
          description="Speel de Snatzee-geluiden bij het opstarten, een nieuwe score en een achievement."
          checked={soundOn}
          onCheckedChange={(next) => {
            setSoundOn(next)
            setSoundEnabled(next)
            // Let them hear what they just switched on.
            if (next) playSound('score')
          }}
        />
        <ToggleRow
          label="Pushmeldingen"
          description={pushDescription}
          checked={pushOn}
          disabled={pushBusy || !pushAvailable}
          onCheckedChange={togglePush}
        />
        {pushOn && (
          <Button variant="soft" size="sm" onClick={sendTestNotification} loading={pushBusy}>
            <Bell className="size-4" aria-hidden />
            Stuur een testmelding
          </Button>
        )}
      </Section>

      <Section title="Weergave" icon={Palette}>
        <ToggleRow
          label="Minder beweging"
          description="Beperk animaties en overgangen in de app."
          checked={reducedMotion}
          onCheckedChange={(next) => {
            setReducedMotion(next)
            writeLocalPreference('snatzee:reduced-motion', next)
            document.documentElement.classList.toggle('motion-reduce', next)
          }}
        />
      </Section>

      <form action="/auth/signout" method="post">
        <Button type="submit" variant="soft" full size="lg">
          <LogOut className="size-5" aria-hidden />
          Uitloggen
        </Button>
      </form>

      <div className="rounded-[1.5rem] bg-rose-ember-500/10 p-4 ring-1 ring-rose-ember-500/30">
        <h2 className="text-sm font-bold text-rose-ember-300">Gevarenzone</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          Je account verwijderen wist je profiel, al je potjes, Yahtzees, achievements, vriendschappen
          en groepslidmaatschappen. Dit kan niet ongedaan worden gemaakt.
        </p>
        <Button variant="dangerSoft" full className="mt-4" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" aria-hidden />
          Account verwijderen
        </Button>
      </div>

      <BottomSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Profiel wijzigen"
        description="Je username ligt vast — de rest kun je altijd aanpassen."
        footer={
          <Button type="submit" form="edit-profile" full size="lg" loading={saving}>
            Opslaan
          </Button>
        }
      >
        <form id="edit-profile" onSubmit={saveProfile} className="space-y-6 pb-2">
          <div className="pt-2">
            <AvatarUploader
              userId={profile.id}
              value={avatarUrl}
              name={displayName}
              onChange={setAvatarUrl}
            />
          </div>

          <div>
            <Label htmlFor={displayNameId}>Weergavenaam</Label>
            <Input
              id={displayNameId}
              value={displayName}
              maxLength={DISPLAY_NAME_MAX}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <FieldError>{error}</FieldError>
          </div>

          <div>
            <Label htmlFor={bioId}>
              Bio <span className="font-normal text-ink-muted">(optioneel)</span>
            </Label>
            <Textarea
              id={bioId}
              value={bio}
              maxLength={200}
              placeholder="Bijv. vaste deelnemer aan het familietoernooi"
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Account verwijderen"
        description="Typ VERWIJDER om te bevestigen. Deze actie is definitief."
        footer={
          <Button
            variant="danger"
            full
            size="lg"
            loading={deleting}
            disabled={deleteConfirm.trim().toUpperCase() !== 'VERWIJDER'}
            onClick={deleteAccount}
          >
            Definitief verwijderen
          </Button>
        }
      >
        <div className="pb-2">
          <Label htmlFor={confirmId}>Bevestiging</Label>
          <Input
            id={confirmId}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="VERWIJDER"
            className="text-center text-xl font-black tracking-[0.2em]"
          />
        </div>
      </BottomSheet>
    </div>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Bell
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[1.75rem] bg-surface p-5 ring-1 ring-hairline shadow-soft">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-muted">
        <Icon className="size-4" aria-hidden strokeWidth={2.4} />
        {title}
      </h2>
      <div className="divide-y divide-hairline">{children}</div>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <span className="text-[0.95rem] font-semibold text-ink">{label}</span>
      <span className="selectable truncate text-sm text-ink-muted">{value}</span>
    </div>
  )
}
