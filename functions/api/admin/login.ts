// POST /api/admin/login  { user, password }
// Separate, stronger admin login. Verifies ADMIN_USER + ADMIN_PASSWORD(_HASH)
// and, on success, issues a short-lived signed session cookie with the
// `admin` role (which also satisfies viewer-level checks).

import { badRequest, json } from '../../_lib/http'
import { constantTimeEqual, verifyPassword } from '../../_lib/crypto'
import { buildSessionCookie, createSessionToken, isSecureRequest } from '../../_lib/session'
import type { Env, MiddlewareData } from '../../_lib/types'

export const onRequestPost: PagesFunction<Env, string, MiddlewareData> = async ({ request, env }) => {
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
