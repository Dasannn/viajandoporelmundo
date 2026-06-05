// Low-level crypto helpers built on the Web Crypto API (crypto.subtle),
// which is available natively in the Cloudflare Workers runtime.
// No external dependencies.

const enc = new TextEncoder()

// --- base64url <-> bytes ---------------------------------------------------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0
  s += '='.repeat(pad)
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

// --- constant-time comparison ---------------------------------------------

/** Constant-time string comparison (mitigates timing attacks on secrets). */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let r = 0
  for (let i = 0; i < ab.length; i++) r |= ab[i] ^ bb[i]
  return r === 0
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]
  return r === 0
}

// --- HMAC-SHA256 (session signing) ----------------------------------------

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await importHmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return bytesToBase64Url(new Uint8Array(sig))
}

export async function hmacVerify(secret: string, data: string, sig: string): Promise<boolean> {
  const key = await importHmacKey(secret)
  let sigBytes: Uint8Array<ArrayBuffer>
  try {
    sigBytes = base64UrlToBytes(sig)
  } catch {
    return false
  }
  // crypto.subtle.verify is constant-time.
  return crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data))
}

// --- password verification -------------------------------------------------

/**
 * Verify a password against a stored secret.
 * - If `stored` is a `pbkdf2$iterations$salt$hash` string, run PBKDF2 and compare.
 * - Otherwise treat `stored` as a plaintext secret and constant-time compare.
 *
 * Generate the hashed form with: node scripts/hash-password.mjs "your-password"
 */
export async function verifyPassword(stored: string, provided: string): Promise<boolean> {
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$')
    if (parts.length !== 4) return false
    const iterations = parseInt(parts[1], 10)
    if (!Number.isFinite(iterations) || iterations <= 0) return false
    let salt: Uint8Array<ArrayBuffer>
    let expected: Uint8Array<ArrayBuffer>
    try {
      salt = base64UrlToBytes(parts[2])
      expected = base64UrlToBytes(parts[3])
    } catch {
      return false
    }
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(provided),
      'PBKDF2',
      false,
      ['deriveBits'],
    )
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial,
      expected.length * 8,
    )
    return constantTimeEqualBytes(new Uint8Array(bits), expected)
  }
  return constantTimeEqual(stored, provided)
}
