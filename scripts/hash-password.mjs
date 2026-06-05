// Generate a PBKDF2 hash for the admin password.
//
//   node scripts/hash-password.mjs "your-strong-admin-password"
//
// Copy the printed `pbkdf2$...` value into Cloudflare Pages → Settings →
// Variables as ADMIN_PASSWORD_HASH (Encrypt). The backend (functions/_lib/
// crypto.ts → verifyPassword) understands this exact format.

import { webcrypto as crypto } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"')
  process.exit(1)
}

const ITERATIONS = 210_000
const enc = new TextEncoder()
const salt = crypto.getRandomValues(new Uint8Array(16))

const keyMaterial = await crypto.subtle.importKey(
  'raw',
  enc.encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
)
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  keyMaterial,
  256,
)

const b64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

console.log(`pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`)
