// R2-backed photo upload, serving, and deletion for destination galleries (Phase C).
//
// Auth model (reuses Phase A sessions):
//   - GET    /api/photos/<key>                     viewer+  (photos are NOT
//            public URLs — without a session they 401, so galleries can't leak)
//   - POST   /api/destinations/:id/photos          admin    (multipart upload)
//   - DELETE /api/destinations/:id/photos/:photoId admin

import { authorize } from './lib/auth'
import { badRequest, json } from './lib/http'
import { loadDetail } from './destinations'
import type { DestinationDetail, Env } from './lib/types'

const notFound = (): Response => json({ error: 'not_found' }, { status: 404 })
const noDb = (): Response => json({ error: 'database_unavailable' }, { status: 503 })
const noBucket = (): Response => json({ error: 'storage_unavailable' }, { status: 503 })

/** Max bytes per uploaded file (15 MB). */
const MAX_BYTES = 15 * 1024 * 1024
/** Image content-types we accept, mapped to a file extension. */
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

// --- shared image-storage engine (reused by upload + import) ---------------

interface StoredImage {
  bytes: ArrayBuffer
  /** A content-type that exists in EXT_BY_TYPE (callers validate this). */
  contentType: string
}

// Store already-validated image bytes under a destination's gallery: write each
// to R2 at dest/<id>/<uuid>.<ext>, insert a photos row, and auto-set the cover
// when the destination has none. Returns the refreshed detail, or null if the
// destination/bindings are missing. Shared by multipart upload and URL import.
export async function storeImages(
  env: Env,
  destId: string,
  items: StoredImage[],
): Promise<DestinationDetail | null> {
  if (!env.DB || !env.BUCKET) return null
  const dest = await env.DB.prepare('SELECT id, cover_key FROM destinations WHERE id = ?')
    .bind(destId)
    .first<{ id: string; cover_key: string | null }>()
  if (!dest) return null

  const orderRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM photos WHERE destination_id = ?',
  )
    .bind(destId)
    .first<{ m: number }>()
  let order = (orderRow?.m ?? -1) + 1
  const now = Math.floor(Date.now() / 1000)
  let coverKey = dest.cover_key

  const inserts: D1PreparedStatement[] = []
  for (const item of items) {
    const ext = EXT_BY_TYPE[item.contentType] ?? 'bin'
    const id = crypto.randomUUID()
    const key = `dest/${destId}/${id}.${ext}`
    await env.BUCKET.put(key, item.bytes, { httpMetadata: { contentType: item.contentType } })
    inserts.push(
      env.DB.prepare(
        `INSERT INTO photos (id, destination_id, r2_key, caption, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(id, destId, key, null, order++, now),
    )
    if (!coverKey) coverKey = key // first photo becomes the cover when none is set
  }
  if (coverKey !== dest.cover_key) {
    inserts.push(
      env.DB.prepare('UPDATE destinations SET cover_key = ? WHERE id = ?').bind(coverKey, destId),
    )
  }
  if (inserts.length) await env.DB.batch(inserts)
  return loadDetail(env, destId)
}

// --- server-side image fetch with anti-SSRF guards (for URL import) ---------

type FetchResult = { ok: true; image: StoredImage } | { ok: false; error: string }

// Reject hostnames/IP-literals that point at the local machine or private
// networks (defence-in-depth — the import endpoint is admin-only, and the
// Workers runtime can't reach internal/metadata services anyway, but we still
// refuse the obvious targets such as 127.0.0.1 and 169.254.169.254).
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '') // strip IPv6 [brackets]
  if (!h || h === 'localhost' || h.endsWith('.localhost')) return true

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const o = v4.slice(1).map(Number)
    if (o.some((n) => n > 255)) return true // malformed → refuse
    const [a, b] = o
    if (a === 0 || a === 127 || a === 10) return true
    if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    return false
  }

  if (h.includes(':')) {
    // IPv6 literal
    if (h === '::1' || h === '::') return true
    if (h.startsWith('fc') || h.startsWith('fd')) return true // fc00::/7 unique-local
    if (h.startsWith('fe80')) return true // link-local
    const mapped = h.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return isBlockedHost(mapped[1])
    return false
  }
  return false
}

// Decode a data:image/... URL directly (no network).
function decodeDataUrl(raw: string): FetchResult {
  const comma = raw.indexOf(',')
  if (comma < 0) return { ok: false, error: 'invalid_data_url' }
  const meta = raw.slice(5, comma) // strip leading 'data:'
  const payload = raw.slice(comma + 1)
  const ct = (meta.split(';')[0] || '').trim().toLowerCase()
  if (!EXT_BY_TYPE[ct]) return { ok: false, error: 'not_an_image' }
  let bytes: ArrayBuffer
  try {
    if (/;base64/i.test(meta)) {
      const bin = atob(payload)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      bytes = arr.buffer
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(payload)).buffer
    }
  } catch {
    return { ok: false, error: 'invalid_data_url' }
  }
  if (bytes.byteLength === 0) return { ok: false, error: 'empty' }
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: 'too_large' }
  return { ok: true, image: { bytes, contentType: ct } }
}

// Fetch an image from an http(s) or data: URL, validating content-type + size.
// `authHeader` (Phase F) is attached for the request (e.g. a Drive bearer token).
export async function fetchImageFromUrl(rawUrl: string, authHeader?: string): Promise<FetchResult> {
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return { ok: false, error: 'invalid_url' }
  }
  if (target.protocol === 'data:') return decodeDataUrl(rawUrl)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { ok: false, error: 'unsupported_protocol' }
  }
  if (isBlockedHost(target.hostname)) return { ok: false, error: 'blocked_host' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let res: Response
  try {
    res = await fetch(target.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: authHeader ? { Authorization: authHeader } : undefined,
    })
  } catch {
    return { ok: false, error: 'fetch_failed' }
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) return { ok: false, error: `http_${res.status}` }
  const ct = (res.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
  if (!EXT_BY_TYPE[ct]) return { ok: false, error: 'not_an_image' }
  const len = Number(res.headers.get('Content-Length') || '')
  if (Number.isFinite(len) && len > MAX_BYTES) return { ok: false, error: 'too_large' }
  const bytes = await res.arrayBuffer()
  if (bytes.byteLength === 0) return { ok: false, error: 'empty' }
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: 'too_large' }
  return { ok: true, image: { bytes, contentType: ct } }
}

// GET /api/photos/<key> — stream an R2 object to an authenticated viewer.
export async function servePhoto(request: Request, env: Env, key: string): Promise<Response> {
  const auth = await authorize(request, env, 'viewer')
  if (auth instanceof Response) return auth
  if (!env.BUCKET) return noBucket()

  // Conditional request support (browser revalidation via ETag).
  const obj = await env.BUCKET.get(key, {
    onlyIf: request.headers.get('If-None-Match')
      ? { etagDoesNotMatch: request.headers.get('If-None-Match')! }
      : undefined,
  })
  if (!obj) return notFound()

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)
  // Private so shared caches/CDNs never store an authenticated image.
  headers.set('Cache-Control', 'private, max-age=3600')

  // If onlyIf failed (etag matched), R2 returns an object without a body.
  if (!('body' in obj) || !obj.body) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(obj.body, { headers })
}

// POST /api/destinations/:id/photos — upload one or more images (admin).
export async function uploadPhotos(request: Request, env: Env, destId: string): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  if (!env.BUCKET) return noBucket()

  const dest = await env.DB.prepare('SELECT id FROM destinations WHERE id = ?')
    .bind(destId)
    .first<{ id: string }>()
  if (!dest) return notFound()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return badRequest('expected_multipart')
  }
  const files = form.getAll('file').filter((f): f is File => f instanceof File)
  if (files.length === 0) return badRequest('no_files')

  // Validate everything up front so we never leave a partial upload behind.
  for (const file of files) {
    const type = file.type || ''
    if (!EXT_BY_TYPE[type]) return badRequest('unsupported_type')
    if (file.size > MAX_BYTES) return badRequest('file_too_large')
  }

  const items: StoredImage[] = await Promise.all(
    files.map(async (f) => ({ bytes: await f.arrayBuffer(), contentType: f.type })),
  )
  const detail = await storeImages(env, destId, items)
  if (!detail) return notFound()
  return json(detail, { status: 201 })
}

// POST /api/destinations/:id/photos/import — import images from a list of URLs
// (admin). Used by drag-and-drop from other browser tabs: each URL is fetched
// server-side (no browser CORS) and stored in R2 just like an upload. Returns
// the refreshed detail plus a summary of how many imported / which failed.
export async function importPhotos(request: Request, env: Env, destId: string): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  if (!env.BUCKET) return noBucket()

  const dest = await env.DB.prepare('SELECT id FROM destinations WHERE id = ?')
    .bind(destId)
    .first<{ id: string }>()
  if (!dest) return notFound()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest()
  }
  const rawUrls = (body as { urls?: unknown })?.urls
  const urls = Array.isArray(rawUrls) ? rawUrls.filter((u): u is string => typeof u === 'string') : []
  if (urls.length === 0) return badRequest('no_urls')
  if (urls.length > 25) return badRequest('too_many_urls')

  const items: StoredImage[] = []
  const failed: { url: string; error: string }[] = []
  for (const url of urls) {
    const r = await fetchImageFromUrl(url)
    if (r.ok) items.push(r.image)
    else failed.push({ url: url.length > 200 ? url.slice(0, 200) + '…' : url, error: r.error })
  }

  const detail = items.length ? await storeImages(env, destId, items) : await loadDetail(env, destId)
  if (!detail) return notFound()
  return json({ detail, imported: items.length, failed })
}

// POST /api/destinations/:id/photos/import-drive — import images chosen in the
// Google Drive Picker (admin). The browser sends the picked `fileIds` plus a
// short-lived OAuth `accessToken` (scope drive.file). We download each file's
// bytes server-side from the Drive API with that bearer token and store them in
// R2 like any other photo. The token is used transiently and never persisted.
export async function importDrivePhotos(
  request: Request,
  env: Env,
  destId: string,
): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  if (!env.BUCKET) return noBucket()

  const dest = await env.DB.prepare('SELECT id FROM destinations WHERE id = ?')
    .bind(destId)
    .first<{ id: string }>()
  if (!dest) return notFound()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest()
  }
  const b = (body ?? {}) as { fileIds?: unknown; accessToken?: unknown }
  const accessToken = typeof b.accessToken === 'string' ? b.accessToken.trim() : ''
  const fileIds = Array.isArray(b.fileIds)
    ? b.fileIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : []
  if (!accessToken) return badRequest('missing_token')
  if (fileIds.length === 0) return badRequest('no_files')
  if (fileIds.length > 50) return badRequest('too_many_files')

  const items: StoredImage[] = []
  const failed: { id: string; error: string }[] = []
  for (const fid of fileIds) {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fid)}?alt=media`
    const r = await fetchImageFromUrl(url, `Bearer ${accessToken}`)
    if (r.ok) items.push(r.image)
    else failed.push({ id: fid, error: r.error })
  }

  const detail = items.length ? await storeImages(env, destId, items) : await loadDetail(env, destId)
  if (!detail) return notFound()
  return json({ detail, imported: items.length, failed })
}

// DELETE /api/destinations/:id/photos/:photoId — remove one photo (admin).
export async function deletePhoto(
  request: Request,
  env: Env,
  destId: string,
  photoId: string,
): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  const bucket = env.BUCKET
  if (!bucket) return noBucket()

  const photo = await env.DB.prepare(
    'SELECT r2_key FROM photos WHERE id = ? AND destination_id = ?',
  )
    .bind(photoId, destId)
    .first<{ r2_key: string }>()
  if (!photo) return notFound()

  await bucket.delete(photo.r2_key)
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(photoId),
    // If this was the cover, clear it so the UI can pick a new one.
    env.DB.prepare('UPDATE destinations SET cover_key = NULL WHERE id = ? AND cover_key = ?').bind(
      destId,
      photo.r2_key,
    ),
  ])

  const detail = await loadDetail(env, destId)
  return json(detail)
}
