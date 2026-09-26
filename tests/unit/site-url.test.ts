import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { siteOrigin } from '@/lib/site-url'

const request = (headers: Record<string, string>) =>
  new Request('http://app:3000/auth/callback', { headers })

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.snatzee.nl'
  delete process.env.ALLOWED_HOSTS
})

test('without an allowlist the forwarded host is used', () => {
  const origin = siteOrigin(
    request({ 'x-forwarded-host': 'snatzee.example', 'x-forwarded-proto': 'https' }),
  )
  assert.equal(origin, 'https://snatzee.example')
})

test('with an allowlist a forged host falls back to the site URL', () => {
  process.env.ALLOWED_HOSTS = 'snatzee.frankvandetechniek.nl'
  const forged = request({ 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' })
  assert.equal(siteOrigin(forged), 'https://www.snatzee.nl')

  const listed = request({
    'x-forwarded-host': 'snatzee.frankvandetechniek.nl',
    'x-forwarded-proto': 'https',
  })
  assert.equal(siteOrigin(listed), 'https://snatzee.frankvandetechniek.nl')
})

test('the site URL host is always allowed', () => {
  process.env.ALLOWED_HOSTS = 'other.example'
  assert.equal(
    siteOrigin(request({ host: 'www.snatzee.nl', 'x-forwarded-proto': 'https' })),
    'https://www.snatzee.nl',
  )
})

test('a host header carrying a path is never trusted', () => {
  assert.equal(
    siteOrigin(request({ 'x-forwarded-host': 'evil.example/x', 'x-forwarded-proto': 'https' })),
    'https://www.snatzee.nl',
  )
})

test('an unknown scheme is not passed through', () => {
  assert.equal(
    siteOrigin(request({ 'x-forwarded-host': 'snatzee.example', 'x-forwarded-proto': 'javascript' })),
    'http://snatzee.example',
  )
})
