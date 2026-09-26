import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { signEs256Jwt } from '@/lib/apns'

test('the provider token is a JWT whose ES256 signature verifies', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

  const jwt = signEs256Jwt(pem, { kid: 'ABC123DEFG' }, { iss: 'TEAM123456', iat: 1_700_000_000 })
  const [head, body, signature] = jwt.split('.')

  assert.deepEqual(JSON.parse(Buffer.from(head!, 'base64url').toString()), {
    alg: 'ES256',
    kid: 'ABC123DEFG',
  })
  assert.deepEqual(JSON.parse(Buffer.from(body!, 'base64url').toString()), {
    iss: 'TEAM123456',
    iat: 1_700_000_000,
  })
  // 64 bytes: the raw r||s pair JWS requires, not a DER blob.
  const raw = Buffer.from(signature!, 'base64url')
  assert.equal(raw.length, 64)
  assert.equal(
    verify('sha256', Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, raw),
    true,
  )
})
