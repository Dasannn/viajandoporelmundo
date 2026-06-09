// Google Drive Picker integration (Phase F).
//
// Loads the Picker (apis.google.com/js/api.js) and Google Identity Services
// (accounts.google.com/gsi/client) on demand, asks for a short-lived
// `drive.file` access token, and opens the Picker so the admin can choose
// images. Returns the chosen file ids + the token; the caller posts those to
// the Worker, which downloads each file server-side into R2.
//
// `drive.file` is a non-sensitive scope: the token only grants access to the
// files the user explicitly picks, so the app stays in Google "Testing" mode
// without verification (and the page stays private).

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const SCOPE = 'https://www.googleapis.com/auth/drive.file'

/** True when the build was given both Google client values (see .env). */
export function driveConfigured(): boolean {
  return !!CLIENT_ID && !!API_KEY
}

// The Google globals are untyped; access them through a narrow alias.
/* eslint-disable @typescript-eslint/no-explicit-any */
function gapi(): any {
  return (window as unknown as { gapi?: any }).gapi
}
function gis(): any {
  return (window as unknown as { google?: any }).google
}

// Load an external script exactly once (cached by URL).
const scriptPromises = new Map<string, Promise<void>>()
function loadScript(src: string): Promise<void> {
  let p = scriptPromises.get(src)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error(`failed_to_load:${src}`))
      document.head.appendChild(s)
    })
    scriptPromises.set(src, p)
  }
  return p
}

let pickerReady = false
async function ensureLoaded(): Promise<void> {
  await Promise.all([
    loadScript('https://apis.google.com/js/api.js'),
    loadScript('https://accounts.google.com/gsi/client'),
  ])
  if (!pickerReady) {
    await new Promise<void>((resolve) => gapi().load('picker', () => resolve()))
    pickerReady = true
  }
}

// Request a fresh access token via the GIS token client (opens a popup the
// first time to grant consent; the button click is the required user gesture).
function requestToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = gis().accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp: { access_token?: string; error?: string }) => {
        if (resp.access_token) resolve(resp.access_token)
        else reject(new Error(resp.error || 'no_token'))
      },
    })
    client.requestAccessToken({ prompt: '' })
  })
}

// Open the Picker (images only, multi-select) and resolve with the chosen ids
// (empty array if the user cancels).
function openPicker(accessToken: string): Promise<string[]> {
  return new Promise((resolve) => {
    const google = gis()
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
    const builder = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .addView(view)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const docs: any[] = data.docs || []
          resolve(docs.map((d) => d.id).filter((x): x is string => typeof x === 'string'))
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve([])
        }
      })
    // setAppId = the Cloud project number (leading segment of the client id);
    // required for drive.file Picker access to the picked files.
    const projectNumber = (CLIENT_ID || '').split('-')[0]
    if (projectNumber) builder.setAppId(projectNumber)
    builder.build().setVisible(true)
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface DrivePick {
  fileIds: string[]
  accessToken: string
}

/**
 * Run the full Drive flow: load scripts → token → Picker. Resolves with the
 * picked file ids + token, or null if the user picked nothing / cancelled.
 * Throws if Drive isn't configured or a script/token step fails.
 */
export async function pickFromDrive(): Promise<DrivePick | null> {
  if (!driveConfigured()) throw new Error('drive_not_configured')
  await ensureLoaded()
  const accessToken = await requestToken()
  const fileIds = await openPicker(accessToken)
  if (fileIds.length === 0) return null
  return { fileIds, accessToken }
}
