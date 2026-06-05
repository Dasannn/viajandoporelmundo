// POST /api/login  { password }
// Visitor gate. Verifies the password against the VIEWER_PASSWORD secret
// (server-side; the password never ships in the client bundle) and, on
// success, sets a signed HttpOnly session cookie with the `viewer` role.

import { badRequest, json } from '../_lib/http'
import { verifyPassword } from '../_lib/crypto'
import { buildSessionCookie, createSessionToken, isSecureRequest } from '../_lib/session'
import type { Env, MiddlewareData } from '../_lib/types'

export const onRequestPost: PagesFunction<Env, string, MiddlewareData> = async ({ request, env }) => {
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
