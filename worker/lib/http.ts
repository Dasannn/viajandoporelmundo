// Small response helpers shared by the API routes.

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // API responses are never cached by the browser/CDN.
      'Cache-Control': 'no-store',
      ...(init.headers || {}),
    },
  })
}

export const unauthorized = () => json({ error: 'unauthenticated' }, { status: 401 })
export const forbidden = () => json({ error: 'forbidden' }, { status: 403 })
export const badRequest = (msg = 'bad_request') => json({ error: msg }, { status: 400 })
