/**
 * Seeds a development database with believable demo players so the interface
 * can be judged with real data in it.
 *
 *   npm run seed
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. Refuses to run against production:
 * demo data is a development aid, never something to ship to real users.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// Minimal .env loader so the script works without extra dependencies.
for (const file of ['.env.local', '.env']) {
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (match?.[1] && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2]?.replace(/^["']|["']$/g, '') ?? ''
      }
    }
  } catch {
    // File is optional.
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PASSWORD = 'snatzee-demo-1234'

const PLAYERS = [
  { username: 'mathijs', display_name: 'Mathijs', skill: 262, spread: 52, games: 84, yahtzees: 21, firstRolls: 3 },
  { username: 'pien', display_name: 'Pien', skill: 251, spread: 48, games: 67, yahtzees: 16, firstRolls: 2 },
  { username: 'frank', display_name: 'Frank', skill: 243, spread: 55, games: 128, yahtzees: 27, firstRolls: 4 },
  { username: 'daniel', display_name: 'Daniel', skill: 229, spread: 44, games: 41, yahtzees: 8, firstRolls: 1 },
  { username: 'sophie', display_name: 'Sophie', skill: 238, spread: 60, games: 53, yahtzees: 12, firstRolls: 2 },
  { username: 'joost', display_name: 'Joost', skill: 221, spread: 39, games: 22, yahtzees: 4, firstRolls: 0 },
] as const

const NOTES = [
  'Vakantiepotje met het hele gezin',
  'Net niet gewonnen van Pien',
  'Drie keer achter elkaar een Yahtzee-kans gemist',
  'Zondagmiddag met koffie',
  'Kampioen van de avond',
  null,
  null,
  null,
]

/** Box-Muller: gives a natural bell curve around a player's skill level. */
function normal(mean: number, deviation: number) {
  const u = Math.max(Math.random(), Number.EPSILON)
  const v = Math.random()
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.round(mean + z * deviation)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

async function findOrCreateUser(username: string, displayName: string) {
  const email = `${username}@demo.snatzee.app`

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username, display_name: displayName },
  })

  if (created?.user) return created.user.id

  // Already exists — look the account up instead of failing.
  if (error && !/already/i.test(error.message)) throw error

  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users.find((u) => u.email === email)
  if (!existing) throw error ?? new Error(`Could not create or find ${email}`)
  return existing.id
}

async function main() {
  console.log(`Seeding ${PLAYERS.length} demo players into ${url}\n`)
  const ids: Record<string, string> = {}

  for (const player of PLAYERS) {
    const id = await findOrCreateUser(player.username, player.display_name)
    ids[player.username] = id

    await supabase
      .from('profiles')
      .update({
        username: player.username,
        display_name: player.display_name,
        onboarding_completed: true,
      })
      .eq('id', id)

    // Start clean so re-running the seed does not pile data up.
    await supabase.from('score_entries').delete().eq('user_id', id)
    await supabase.from('yahtzee_events').delete().eq('user_id', id)

    const scores = Array.from({ length: player.games }, (_, index) => {
      const daysAgo = Math.floor((player.games - index) * (240 / player.games)) + Math.floor(Math.random() * 3)
      const playedAt = new Date()
      playedAt.setDate(playedAt.getDate() - daysAgo)
      playedAt.setHours(18 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 60), 0, 0)

      const score = clamp(normal(player.skill, player.spread), 45, 480)

      return {
        user_id: id,
        score,
        // Higher scores win more often, which keeps the win rates believable.
        is_win: Math.random() < clamp((score - 180) / 220, 0.05, 0.85),
        played_at: playedAt.toISOString(),
        note: NOTES[Math.floor(Math.random() * NOTES.length)] ?? null,
      }
    })

    const { error: scoreError } = await supabase.from('score_entries').insert(scores)
    if (scoreError) throw scoreError

    const events = [
      ...Array.from({ length: player.yahtzees - player.firstRolls }, () => 'NORMAL' as const),
      ...Array.from({ length: player.firstRolls }, () => 'FIRST_ROLL' as const),
    ].map((event_type) => {
      const created = new Date()
      created.setDate(created.getDate() - Math.floor(Math.random() * 240))
      return { user_id: id, event_type, created_at: created.toISOString() }
    })

    if (events.length > 0) {
      const { error: eventError } = await supabase.from('yahtzee_events').insert(events)
      if (eventError) throw eventError
    }

    // The achievement triggers already fired per row; this catches anything
    // that depends on aggregates across the whole batch.
    await supabase.rpc('evaluate_achievements', { p_user: id })

    console.log(
      `  ✓ ${player.display_name.padEnd(8)} ${player.games} potjes · ${player.yahtzees} Yahtzee's (${player.firstRolls} in één worp)`,
    )
  }

  // Everyone is friends with Frank, and there is one shared group.
  const frank = ids.frank!
  const friendships = PLAYERS.filter((p) => p.username !== 'frank').map((p) => ({
    requester_id: frank,
    addressee_id: ids[p.username]!,
    status: 'accepted' as const,
  }))

  await supabase.from('friendships').delete().eq('requester_id', frank)
  await supabase.from('friendships').insert(friendships)

  const { data: existingGroup } = await supabase
    .from('groups')
    .select('id')
    .eq('name', 'Familie')
    .eq('owner_id', frank)
    .maybeSingle()

  let groupId = (existingGroup as { id: string } | null)?.id
  if (!groupId) {
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({ owner_id: frank, name: 'Familie', emoji: '🎲', description: 'Het jaarlijkse toernooi' })
      .select('id')
      .single()
    if (groupError) throw groupError
    groupId = (group as { id: string }).id
  }

  await supabase.from('group_members').upsert(
    Object.entries(ids).map(([username, userId]) => ({
      group_id: groupId!,
      user_id: userId,
      role: username === 'frank' ? ('owner' as const) : ('member' as const),
    })),
    { onConflict: 'group_id,user_id' },
  )

  console.log(`\n✓ Friendships and the "Familie" group are set up.`)
  console.log(`\nSign in as any demo player:`)
  console.log(`  e-mail:   <username>@demo.snatzee.app   (e.g. frank@demo.snatzee.app)`)
  console.log(`  password: ${PASSWORD}`)
}

main().catch((error) => {
  console.error('\nSeeding failed:', error)
  process.exit(1)
})
