# Snatzee API for the iOS app

The iOS app talks to the same backend as the website. There is no separate
"mobile API": Supabase *is* the API, and every rule (who may see what, what a
valid score is) is enforced in the database, so a native client gets exactly
the same guarantees as the web app.

Base URL: the site's public address (`PUBLIC_URL`), e.g. `https://snatzee.example.nl`.

| Path | What it is |
| --- | --- |
| `/auth/v1/*` | GoTrue — sign-up, sign-in, tokens, password reset |
| `/rest/v1/*` | PostgREST — tables, views and RPCs (`/rest/v1/rpc/<name>`) |
| `/storage/v1/*` | Storage — avatars (`avatars/<user-id>/<file>`) |
| `/api/*` | Next.js routes for the few things the database cannot do |

Use [`supabase-swift`](https://github.com/supabase/supabase-swift) with the
base URL and the **anon key** (public by design; RLS does the protecting).

## Signing in

Only two ways in: **email + password** and **Sign in with Apple**.

- Email: `client.auth.signUp` / `signIn(email:password:)`. With confirmation
  mails on, the link lands on `/auth/confirm`, which is a universal link (see
  below), so it opens the app.
- Apple: use `ASAuthorizationAppleIDProvider`, then
  `client.auth.signInWithIdToken(credentials: .init(provider: .apple, idToken:, nonce:))`.
  GoTrue accepts the token because the app's **bundle ID** is listed in
  `APPLE_CLIENT_ID` (after the web Services ID). Keep the
  `authorizationCode` handling in mind for account deletion.

After sign-in, check `profiles.onboarding_completed`; when false, run
onboarding and finish with `rpc/complete_onboarding`.

## Calling the Next.js routes

Send the GoTrue access token:

```
Authorization: Bearer <access_token>
```

| Route | Body | Notes |
| --- | --- | --- |
| `POST /api/account/delete` | `{ "appleAuthorizationCode"?: string, "appleClientId"?: string }` | Deletes the account, avatars and — with a fresh Apple authorization code — revokes the Apple ID link (required by App Store guideline 5.1.1(v)). Ask the user to confirm with Apple right before, and send that code. `appleClientId` defaults to the bundle ID. |
| `POST /api/push/test` | — | Sends a test notification to all of the caller's devices. |
| `POST /api/push/drain` | — | Optional nudge; the server also flushes on its own every few seconds. |

## Push notifications (APNs)

1. Request permission, call `registerForRemoteNotifications()`.
2. In `didRegisterForRemoteNotificationsWithDeviceToken`, hex-encode the token and call:
   ```
   rpc/register_apns_device {
     p_token: "<hex>", p_environment: "sandbox" | "production",
     p_bundle_id: "<bundle id>", p_app_version: "1.0 (42)"
   }
   ```
   Do this on **every launch** — APNs can change the token. Debug builds use
   `sandbox`, TestFlight and App Store builds `production`.
3. On sign-out: `rpc/unregister_apns_device { p_token }`.

Payload: `aps.alert.{title,body}`, plus `url` (an in-app path such as
`/app/friends?tab=requests`, `/app/groups/<id>`, `/u/<username>`) and extra
fields per kind (`group_id`, `score`, …). Route on `url`.

## Universal links

`/.well-known/apple-app-site-association` is served from `APPLE_APP_IDS`
(`<TEAMID>.<bundle id>`). The app should declare the associated domains
`applinks:<domain>` and `webcredentials:<domain>` and handle:

`/u/<username>` · `/app` · `/app/*` · `/auth/confirm` · `/auth/callback`

## Screens and their RPCs

Everything below is `POST /rest/v1/rpc/<name>` with a JSON body of named
parameters. Signed-in unless marked *anon*.

| Screen | RPC |
| --- | --- |
| Launch | `get_client_config()` *anon* → `{ api_version, server_time, settings }`. Refuse to run when your build number is below `settings.min_ios_build`. |
| Home | `get_home_summary()` |
| Add / edit a game | `record_score_entry(p_score, p_is_win, p_played_at, p_note, p_yahtzee_count, p_sheet)`, `update_score_entry(p_id, …, p_clear_sheet)` — the score must equal the sheet total **including** the Yahtzee bonus (100 per Yahtzee after the first, when box 11 holds 50). |
| First-roll Yahtzee | `record_yahtzee('FIRST_ROLL')` |
| History | `score_entries` (own rows, `select`/`delete` via REST) |
| Statistics | `user_statistics` view, `get_user_statistics(p_username)` *anon* |
| Rankings | `get_leaderboard(p_metric, p_scope, p_group_id, p_limit)` |
| Achievements | `achievements` + `user_achievements` |
| Friends | `get_friends_overview()` → `{ friends, requests, sent }`; `search_users(p_query)`, `send_friend_request(p_user_id)`, `respond_friend_request(p_id, p_accept)`, `remove_friend(p_user_id)` |
| Groups | `groups` (own, via REST), `get_group_detail(p_group_id)`, `create_group`, `join_group(p_invite_code)`, `add_group_members`, `leave_group`, `remove_group_member` |
| Public profile | `get_public_profile(p_username)` *anon* → profile, relation, stats, achievements, recent scores (details only when allowed); `null` = not found |
| Settings | `profiles` (own row: `display_name`, `bio`, `avatar_url`, `is_private` via REST update), `has_push_subscription()` |
| Safety | `report_content(p_reason, p_target_user_id, p_target_group_id, p_details)`, `block_user(p_user_id)`, `unblock_user(p_user_id)`, `list_blocked_users()` |

Report reasons: `OFFENSIVE_NAME`, `OFFENSIVE_AVATAR`, `OFFENSIVE_BIO`,
`OFFENSIVE_GROUP`, `CHEATING`, `HARASSMENT`, `SPAM`, `OTHER`.

## Errors

RPC errors come back from PostgREST as `{ code, message, hint, details }`.
`message` is a Dutch sentence meant for people. Newer RPCs also set `hint` to
a stable key (`not_signed_in`, `user_not_found`, `group_not_found`,
`rate_limited`, `invalid_device_token`, …) — translate on that, not on the
text. `code` is the SQLSTATE: `28000` not signed in, `42501` not allowed,
`22023` invalid input, `P0002` not found.

## Compatibility rules (server side)

Installed apps cannot be forced to update, so from now on:

- **Only add.** New RPCs, new optional parameters with defaults, new fields
  in JSON results. Never rename or remove a parameter, a result field, or a
  function signature an app may call.
- A breaking change gets a **new function name** (`get_x_v2`) and the old one
  stays until `min_ios_build` has passed every app that used it.
- Raise `api_version` in `get_client_config()` only for a change an older app
  cannot follow, and raise `min_ios_build` together with it.
