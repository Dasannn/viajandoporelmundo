// Per-destination background music (Phase D).
//
// Mounts once and stays mounted; the YouTube IFrame player is created a single
// time and reused. When the open destination (`destination`) has a `musicId`,
// the video loads + plays and a "♪ Sonando: <title>" bar appears bottom-left.
// Closing the pin (destination → null) stops playback immediately.
//
// Autoplay-with-sound works because opening a pin is a user click (the document
// has user activation), which satisfies the browser autoplay policy.

import { useEffect, useRef, useState } from 'react'
import type { DestinationDetail } from '../types'

// --- Minimal typings for the bits of the IFrame API we touch ----------------
interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  stopVideo(): void
  destroy(): void
  getVideoData(): { title?: string; video_id?: string }
}
interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

// Load https://www.youtube.com/iframe_api exactly once, resolving when ready.
let ytPromise: Promise<YTNamespace> | null = null
function loadYT(): Promise<YTNamespace> {
  if (ytPromise) return ytPromise
  ytPromise = new Promise<YTNamespace>((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT)
      return
    }
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT) resolve(window.YT)
    }
    if (!document.getElementById('yt-iframe-api')) {
      const s = document.createElement('script')
      s.id = 'yt-iframe-api'
      s.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(s)
    }
  })
  return ytPromise
}

export default function MusicPlayer({ destination }: { destination: DestinationDetail | null }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const readyRef = useRef(false)
  // Holds a request that arrived before the player was ready (or null to stop).
  const pendingRef = useRef<{ videoId: string; startSeconds: number } | null>(null)
  const [title, setTitle] = useState('')
  const [failed, setFailed] = useState(false)

  const musicId = destination?.musicId ?? null
  const musicStart = destination?.musicStart ?? 0

  // Create the player once, on mount.
  useEffect(() => {
    let cancelled = false
    loadYT().then((YT) => {
      if (cancelled || !hostRef.current || playerRef.current) return
      playerRef.current = new YT.Player(hostRef.current, {
        width: '220',
        height: '124',
        playerVars: { autoplay: 0, playsinline: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => {
            readyRef.current = true
            const p = pendingRef.current
            if (p && playerRef.current) {
              playerRef.current.loadVideoById({ videoId: p.videoId, startSeconds: p.startSeconds })
              pendingRef.current = null
            }
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.PLAYING && playerRef.current) {
              const d = playerRef.current.getVideoData()
              if (d?.title) setTitle(d.title)
            }
          },
          onError: () => setFailed(true),
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  // React to which destination (and thus which song) is open.
  useEffect(() => {
    setFailed(false)
    const player = playerRef.current
    if (musicId) {
      setTitle('')
      // Resolve a human title even before playback starts (best-effort; the
      // PLAYING handler later overrides with the authoritative title).
      fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${musicId}`,
        )}`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { title?: string } | null) => {
          if (j?.title) setTitle((t) => t || j.title!)
        })
        .catch(() => {})

      if (player && readyRef.current) {
        player.loadVideoById({ videoId: musicId, startSeconds: musicStart })
      } else {
        pendingRef.current = { videoId: musicId, startSeconds: musicStart }
      }
    } else {
      // Closing a pin stops the music immediately.
      pendingRef.current = null
      setTitle('')
      if (player && readyRef.current) player.stopVideo()
    }
  }, [musicId, musicStart])

  // Tear the player down if this component ever unmounts.
  useEffect(
    () => () => {
      try {
        playerRef.current?.destroy()
      } catch {
        /* ignore */
      }
    },
    [],
  )

  const visible = !!musicId
  return (
    <div className={`music-bar${visible ? ' show' : ''}`} aria-hidden={!visible}>
      <div className="pokemon-box music-box">
        <div className="music-frame">
          <div ref={hostRef} />
        </div>
        <div className="music-meta">
          <span className="music-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="music-now">
            {failed
              ? 'No se pudo reproducir este vídeo'
              : title
                ? `Sonando: ${title}`
                : 'Cargando música…'}
          </span>
        </div>
      </div>
    </div>
  )
}
