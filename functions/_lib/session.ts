// Stateless signed-cookie sessions for Cloudflare Pages Functions.
// A session token is `base64url(JSON payload) . base64url(HMAC-SHA256)`,
// i.e. a minimal JWT-like token verified server-side with SESSION_SECRET.

import { bytesToBase64Url, base64UrlToBytes, hmacSign, hmacVerify } from './crypto'
import type { Env, Role, SessionData } from './types'

const COOKIE_NAME = 'pg_session'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Token lifetime per role (seconds). Admin sessions are intentionally short. */
const TTL: Record<Role, number> = {
  viewer: 60 * 60 * 24 * 30, // 30 days
  admin: 60 * 60 * 12, // 12 hours
}

export async function createSessionToken(env: Env, role: Role): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionData = { role, iat: now, exp: now + TTL[role] }
  const data = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const sig = await hmacSign(env.SESSION_SECRET, data)
  return `${data}.${sig}`
}

export async function verifySessionToken(
  env: Env,
  token: string | null | undefined,
): Promise<SessionData | null> {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const data = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!(await hmacVerify(env.SESSION_SECRET, data, sig))) return null
  let payload: SessionData
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(data)))
  } catch {
    return null
  }
  if (!payload || (payload.role !== 'viewer' && payload.role !== 'admin')) return null
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

// --- cookie helpers --------------------------------------------------------

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

export function getSessionCookie(request: Request): string | undefined {
  return parseCookies(request.headers.get('Cookie'))[COOKIE_NAME]
}

export function buildSessionCookie(token: string, role: Role, secure: boolean): string {
  const attrs = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${TTL[role]}`,
  ]
  if (secure) attrs.push('Secure')
  return attrs.join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) attrs.push('Secure')
  return attrs.join('; ')
}

/** True when the inbound request is HTTPS (so we only set Secure cookies then). */
export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:'
}

/** Role hierarchy: an admin session also satisfies viewer-level checks. */
export function roleSatisfies(have: Role | undefined, need: Role): boolean {
  if (need === 'viewer') return have === 'viewer' || have === 'admin'
  return have === 'admin'
}
