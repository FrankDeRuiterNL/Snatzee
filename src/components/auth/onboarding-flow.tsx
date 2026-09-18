'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, Loader2, PartyPopper, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/input'
import { AvatarUploader } from '@/components/profile/avatar-uploader'
import { Progress } from '@/components/ui/progress'
import { LogoMark } from '@/components/ui/logo'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { DISPLAY_NAME_MAX, USERNAME_MAX, USERNAME_PATTERN } from '@/lib/constants'
import { haptic } from '@/lib/haptics'

const STEPS = ['welkom', 'username', 'naam', 'foto', 'klaar'] as const
type Step = (typeof STEPS)[number]

export function OnboardingFlow({
  userId,
  initialUsername,
  initialDisplayName,
  initialAvatarUrl,
}: {
  userId: string
  initialUsername: string
  initialDisplayName: string
  initialAvatarUrl: string | null
}) {
  const router = useRouter()
  const usernameId = useId()
  const displayNameId = useId()

  const [step, setStep] = useState(0)
  const [username, setUsername] = useState(initialUsername)
  const [displayName, setDisplayName] = useState(initialDisplayName)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl)
  // The availability answer is tagged with the username it describes, so the
  // "checking…" state is derived instead of written from inside the effect.
  const [availability, setAvailability] = useState<{ username: string; available: boolean } | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const current: Step = STEPS[step] ?? 'welkom'
  const normalized = username.trim().toLowerCase()
  const formatValid = USERNAME_PATTERN.test(normalized)

  // Debounced availability check while typing.
  useEffect(() => {
    if (current !== 'username' || !formatValid) return

    let cancelled = false
    const timer = setTimeout(async () => {
      // Keeping your own current username is always allowed.
      if (normalized === initialUsername.toLowerCase()) {
        if (!cancelled) setAvailability({ username: normalized, available: true })
        return
      }

      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.rpc('is_username_available', { p_username: normalized })
      if (!cancelled) setAvailability({ username: normalized, available: Boolean(data) })
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [normalized, formatValid, current, initialUsername])

  const available = availability?.username === normalized ? availability.available : null
  const checking = formatValid && available === null

  const next = useCallback(() => {
    haptic('light')
    setError(null)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }, [])

  async function finish() {
    if (saving) return
    setSaving(true)
    setError(null)

    const supabase = getSupabaseBrowserClient()
    const { error: rpcError } = await supabase.rpc('complete_onboarding', {
      p_username: normalized,
      p_display_name: displayName.trim(),
      p_avatar_url: avatarUrl,
    })

    if (rpcError) {
      setSaving(false)
      setError(rpcError.message)
      setStep(1)
      return
    }

    haptic('success')
    router.replace('/app')
    router.refresh()
  }

  return (
    <main
      id="main"
      className="safe-x mx-auto flex min-h-dvh w-full max-w-[30rem] flex-col px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
      }}
    >
      <div className="flex items-center gap-3">
        <Progress
          value={step + 1}
          max={STEPS.length}
          label={`Stap ${step + 1} van ${STEPS.length}`}
          className="flex-1"
        />
        <span className="tabular text-xs font-bold text-navy-300">
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            {current === 'welkom' && (
              <div className="text-center">
                <LogoMark size={96} className="mx-auto" />
                <h1 className="mt-7 text-[2.1rem] font-black leading-tight tracking-tight text-navy-900">
                  Welkom bij Snatzee
                </h1>
                <p className="mx-auto mt-3 max-w-[32ch] text-[1.02rem] leading-relaxed text-navy-500">
                  Speel Yahtzee zoals je gewend bent. Voeg na afloop je eindscore toe — wij houden je
                  records, statistieken en achievements bij.
                </p>
              </div>
            )}

            {current === 'username' && (
              <div>
                <h1 className="text-[1.9rem] font-black leading-tight tracking-tight text-navy-900">
                  Kies je username
                </h1>
                <p className="mt-2 text-[0.95rem] text-navy-300">
                  Zo vinden vrienden je terug. Kleine letters, cijfers en _.
                </p>

                <div className="mt-7">
                  <Label htmlFor={usernameId}>Username</Label>
                  <div className="relative">
                    <span
                      aria-hidden
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-300"
                    >
                      @
                    </span>
                    <Input
                      id={usernameId}
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="username"
                      spellCheck={false}
                      enterKeyHint="next"
                      maxLength={USERNAME_MAX}
                      placeholder="mathijs"
                      aria-describedby={`${usernameId}-status`}
                      className="pl-9 pr-11"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2">
                      {checking && <Loader2 className="size-4 animate-spin text-navy-300" aria-hidden />}
                      {!checking && available === true && (
                        <Check className="size-5 text-mint-600" aria-hidden />
                      )}
                      {!checking && available === false && (
                        <X className="size-5 text-rose-ember-500" aria-hidden />
                      )}
                    </span>
                  </div>

                  <p id={`${usernameId}-status`} className="mt-2 min-h-5 text-sm" role="status">
                    {normalized.length > 0 && !formatValid && (
                      <span className="text-rose-ember-500">
                        Gebruik 3–20 tekens: a–z, 0–9 en _
                      </span>
                    )}
                    {formatValid && available === false && (
                      <span className="text-rose-ember-500">Deze username is al bezet</span>
                    )}
                    {formatValid && available === true && (
                      <span className="font-medium text-mint-600">@{normalized} is vrij 🎉</span>
                    )}
                  </p>
                  <FieldError>{error}</FieldError>
                </div>
              </div>
            )}

            {current === 'naam' && (
              <div>
                <h1 className="text-[1.9rem] font-black leading-tight tracking-tight text-navy-900">
                  Hoe mogen we je noemen?
                </h1>
                <p className="mt-2 text-[0.95rem] text-navy-300">
                  Deze naam zie je terug op ranglijsten en profielen.
                </p>

                <div className="mt-7">
                  <Label htmlFor={displayNameId}>Weergavenaam</Label>
                  <Input
                    id={displayNameId}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    enterKeyHint="next"
                    maxLength={DISPLAY_NAME_MAX}
                    placeholder="Mathijs"
                  />
                </div>
              </div>
            )}

            {current === 'foto' && (
              <div className="text-center">
                <h1 className="text-[1.9rem] font-black leading-tight tracking-tight text-navy-900">
                  Zet er een gezicht bij
                </h1>
                <p className="mx-auto mt-2 max-w-[30ch] text-[0.95rem] text-navy-300">
                  Optioneel — je kunt dit later altijd aanpassen in je instellingen.
                </p>

                <div className="mt-10">
                  <AvatarUploader
                    userId={userId}
                    value={avatarUrl}
                    name={displayName || username}
                    onChange={setAvatarUrl}
                  />
                </div>
              </div>
            )}

            {current === 'klaar' && (
              <div className="text-center">
                <motion.span
                  initial={{ scale: 0.5, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', damping: 14, stiffness: 240 }}
                  className="inline-grid size-20 place-items-center rounded-[1.75rem] bg-mint-500 text-navy-950"
                  aria-hidden
                >
                  <PartyPopper className="size-9" strokeWidth={2.2} />
                </motion.span>
                <h1 className="mt-7 text-[2.1rem] font-black leading-tight tracking-tight text-navy-900">
                  Je bent klaar!
                </h1>
                <p className="mx-auto mt-3 max-w-[30ch] text-[1.02rem] leading-relaxed text-navy-500">
                  Pak de dobbelstenen erbij, {displayName.trim() || normalized}. Voeg straks je eerste
                  potje toe en de statistieken beginnen te lopen.
                </p>
                <FieldError>{error}</FieldError>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="space-y-3">
        {current === 'welkom' && (
          <Button full size="lg" onClick={next}>
            Aan de slag <ArrowRight className="size-5" aria-hidden />
          </Button>
        )}

        {current === 'username' && (
          <Button full size="lg" disabled={!formatValid || available !== true} onClick={next}>
            Verder <ArrowRight className="size-5" aria-hidden />
          </Button>
        )}

        {current === 'naam' && (
          <Button full size="lg" disabled={displayName.trim().length === 0} onClick={next}>
            Verder <ArrowRight className="size-5" aria-hidden />
          </Button>
        )}

        {current === 'foto' && (
          <>
            <Button full size="lg" onClick={next}>
              Verder <ArrowRight className="size-5" aria-hidden />
            </Button>
            <Button full size="lg" variant="ghost" onClick={next}>
              Sla over
            </Button>
          </>
        )}

        {current === 'klaar' && (
          <Button full size="lg" loading={saving} onClick={finish}>
            Naar Snatzee
          </Button>
        )}
      </div>
    </main>
  )
}
