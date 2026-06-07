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
import type { Env } from './lib/types'

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

function extFor(type: string, name: string): string {
  if (EXT_BY_TYPE[type]) return EXT_BY_TYPE[type]
  const m = name.match(/\.([a-zA-Z0-9]+)$/)
  return m ? m[1].toLowerCase() : 'bin'
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
  const bucket = env.BUCKET
  if (!bucket) return noBucket()

  const dest = await env.DB.prepare('SELECT id, cover_key FROM destinations WHERE id = ?')
    .bind(destId)
    .first<{ id: string; cover_key: string | null }>()
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

  const orderRow = await env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS m FROM photos WHERE destination_id = ?',
  )
    .bind(destId)
    .first<{ m: number }>()
  let order = (orderRow?.m ?? -1) + 1
  const now = Math.floor(Date.now() / 1000)
  let coverKey = dest.cover_key

  const inserts: D1PreparedStatement[] = []
  for (const file of files) {
    const type = file.type
    const id = crypto.randomUUID()
    const key = `dest/${destId}/${id}.${extFor(type, file.name)}`
    await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } })
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
  await env.DB.batch(inserts)

  const detail = await loadDetail(env, destId)
  return json(detail, { status: 201 })
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
