// API router for /api/* requests. Plain functions (request, env) -> Response,
// reusing the shared crypto/session helpers. Verified by .scratch/verify-auth.mts.

import { badRequest, json, unauthorized } from './lib/http'
import { constantTimeEqual, verifyPassword } from './lib/crypto'
import {
  buildSessionCookie,
  clearSessionCookie,
  createSessionToken,
  getSessionCookie,
  isSecureRequest,
  verifySessionToken,
} from './lib/session'
import {
  createDestination,
  deleteDestination,
  getDestination,
  listDestinations,
  updateDestination,
} from './destinations'
import type { Env } from './lib/types'

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method

  // --- auth (Phase A) ---
  if (pathname === '/api/login' && method === 'POST') return login(request, env)
  if (pathname === '/api/admin/login' && method === 'POST') return adminLogin(request, env)
  if (pathname === '/api/session' && method === 'GET') return session(request, env)
  if (pathname === '/api/logout' && method === 'POST') return logout(request, env)

  // --- destinations (Phase B) ---
  if (pathname === '/api/destinations') {
    if (method === 'GET') return listDestinations(request, env)
    if (method === 'POST') return createDestination(request, env)
  }
  const destMatch = pathname.match(/^\/api\/destinations\/([^/]+)$/)
  if (destMatch) {
    const id = decodeURIComponent(destMatch[1])
    if (method === 'GET') return getDestination(request, env, id)
    if (method === 'PUT') return updateDestination(request, env, id)
    if (method === 'DELETE') return deleteDestination(request, env, id)
  }

  return json({ error: 'not_found' }, { status: 404 })
}

// POST /api/login { password } — visitor gate.
async function login(request: Request, env: Env): Promise<Response> {
  if (!env.SESSION_SECRET || !env.VIEWER_PASSWORD) {
    return json({ error: 'server_misconfigured' }, { status: 500 })
  }
  let body: { password?: unknown }
  try {
    body = await request.json<{ password?: unknown }>()
  } catch {
    return badRequest()
  }
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!password || !(await verifyPassword(env.VIEWER_PASSWORD, password))) {
    return json({ error: 'invalid_credentials' }, { status: 401 })
  }
  const token = await createSessionToken(env, 'viewer')
  return json(
    { role: 'viewer' },
    { headers: { 'Set-Cookie': buildSessionCookie(token, 'viewer', isSecureRequest(request)) } },
  )
}

// POST /api/admin/login { user, password } — separate, stronger admin login.
async function adminLogin(request: Request, env: Env): Promise<Response> {
  const stored = env.ADMIN_PASSWORD_HASH || env.ADMIN_PASSWORD
  if (!env.SESSION_SECRET || !env.ADMIN_USER || !stored) {
    return json({ error: 'server_misconfigured' }, { status: 500 })
  }
  let body: { user?: unknown; password?: unknown }
  try {
    body = await request.json<{ user?: unknown; password?: unknown }>()
  } catch {
    return badRequest()
  }
  const user = typeof body?.user === 'string' ? body.user : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  // Evaluate both checks regardless of outcome to avoid leaking which failed.
  const userOk = constantTimeEqual(env.ADMIN_USER, user)
  const passOk = await verifyPassword(stored, password)
  if (!userOk || !passOk) {
    return json({ error: 'invalid_credentials' }, { status: 401 })
  }
  const token = await createSessionToken(env, 'admin')
  return json(
    { role: 'admin' },
    { headers: { 'Set-Cookie': buildSessionCookie(token, 'admin', isSecureRequest(request)) } },
  )
}

// GET /api/session — returns the current role, or 401.
async function session(request: Request, env: Env): Promise<Response> {
  const s = await verifySessionToken(env, getSessionCookie(request))
  if (!s) return unauthorized()
  return json({ role: s.role })
}

// POST /api/logout — clears the session cookie.
async function logout(request: Request, _env: Env): Promise<Response> {
  return json(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookie(isSecureRequest(request)) } },
  )
}
