// Shared authorization guard for API routes.
// Verifies the session cookie and enforces a minimum role, returning the
// session role on success or a short-circuit Response (401/403) on failure.

import { forbidden, unauthorized } from './http'
import { getSessionCookie, roleSatisfies, verifySessionToken } from './session'
import type { Env, Role } from './types'

export async function authorize(
  request: Request,
  env: Env,
  need: Role,
): Promise<Role | Response> {
  const s = await verifySessionToken(env, getSessionCookie(request))
  if (!s) return unauthorized()
  if (!roleSatisfies(s.role, need)) return forbidden()
  return s.role
}
