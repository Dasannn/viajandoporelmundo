// POST /api/logout
// Clears the session cookie.

import { json } from '../_lib/http'
import { clearSessionCookie, isSecureRequest } from '../_lib/session'
import type { Env, MiddlewareData } from '../_lib/types'

export const onRequestPost: PagesFunction<Env, string, MiddlewareData> = async ({ request }) => {
  return json(
    { ok: true },
    { headers: { 'Set-Cookie': clearSessionCookie(isSecureRequest(request)) } },
  )
}
