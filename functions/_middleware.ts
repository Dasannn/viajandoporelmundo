// Runs before every Pages Function. It verifies the session cookie (if any)
// and attaches the result to context.data.session. It does NOT block requests
// here — each endpoint decides which role it requires — so public endpoints
// like /api/login keep working without a session.

import { getSessionCookie, verifySessionToken } from './_lib/session'
import type { Env, MiddlewareData } from './_lib/types'

export const onRequest: PagesFunction<Env, string, MiddlewareData> = async (context) => {
  const token = getSessionCookie(context.request)
  context.data.session = await verifySessionToken(context.env, token)
  return context.next()
}
