// GET /api/session
// Returns the current session role, or 401 if there is no valid session.
// The SPA calls this on load to decide whether to show the login gate.

import { json, unauthorized } from '../_lib/http'
import type { Env, MiddlewareData } from '../_lib/types'

export const onRequestGet: PagesFunction<Env, string, MiddlewareData> = async ({ data }) => {
  if (!data.session) return unauthorized()
  return json({ role: data.session.role })
}
