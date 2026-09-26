import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatPlayedAt, formatTime, safeNextPath } from '@/lib/utils'

test('safeNextPath keeps same-site paths only', () => {
  assert.equal(safeNextPath('/app/friends?tab=requests'), '/app/friends?tab=requests')
  assert.equal(safeNextPath('//evil.example'), null)
  assert.equal(safeNextPath('/\\evil.example'), null)
  assert.equal(safeNextPath('https://evil.example'), null)
  assert.equal(safeNextPath('javascript:alert(1)'), null)
  assert.equal(safeNextPath(undefined), null)
})

test('times are shown in Dutch time whatever the server runs in', () => {
  // 22:30 UTC in September is 00:30 in Amsterdam (UTC+2).
  assert.equal(formatTime('2026-09-25T22:30:00Z'), '00:30')
  // 23:30 UTC in January is 00:30 in Amsterdam (UTC+1).
  assert.equal(formatTime('2026-01-15T23:30:00Z'), '00:30')
})

test('today and yesterday are named', () => {
  assert.equal(formatPlayedAt(new Date().toISOString()), 'Vandaag')
  assert.equal(formatPlayedAt(new Date(Date.now() - 86_400_000).toISOString()), 'Gisteren')
})
