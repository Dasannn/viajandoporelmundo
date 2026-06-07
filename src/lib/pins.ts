// Pin appearance: shapes, sizes, emoji palette, and the canvas drawing that
// renders a pin's icon. Used both by the 3D globe (as a sprite texture) and by
// the admin editor (as a live <canvas> preview).

import * as THREE from 'three'

export const DEFAULT_PIN_COLOR = '#ffd24f'

/** Built-in vector shapes (drawn on canvas), distinct from free-form emojis. */
export const PIN_SHAPES = [
  { id: 'circle', label: 'Círculo' },
  { id: 'pin', label: 'Pin' },
  { id: 'star', label: 'Estrella' },
  { id: 'diamond', label: 'Rombo' },
  { id: 'square', label: 'Cuadrado' },
  { id: 'triangle', label: 'Triángulo' },
  { id: 'heart', label: 'Corazón' },
  { id: 'ring', label: 'Anillo' },
] as const
export type PinShape = (typeof PIN_SHAPES)[number]['id']
const SHAPE_IDS = new Set<string>(PIN_SHAPES.map((s) => s.id))

export function isShape(icon: string | null | undefined): boolean {
  return !!icon && SHAPE_IDS.has(icon)
}

/** A handful of travel-themed emojis for quick picking (any emoji also works). */
export const PIN_EMOJIS = [
  '📍', '⭐', '❤️', '🏖️', '🏔️', '🗼', '🏛️', '🍜',
  '🎒', '✈️', '🌋', '🏝️', '🎡', '⛩️', '🕌', '🗽',
  '🏰', '🦘', '🐧', '🐠', '🍷', '☕', '🎿', '🌅',
]

export const PIN_SIZES = [
  { id: 's', label: 'S', scale: 0.05 },
  { id: 'm', label: 'M', scale: 0.07 },
  { id: 'l', label: 'L', scale: 0.095 },
] as const
export type PinSize = (typeof PIN_SIZES)[number]['id']

/** World-space sprite scale for a pin size keyword. */
export function sizeScale(size: string | null | undefined): number {
  return PIN_SIZES.find((s) => s.id === size)?.scale ?? 0.07
}

// --- canvas drawing ---------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
}

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, points: number) {
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI / points) * i - Math.PI / 2
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.moveTo(cx, cy + r * 0.85)
  ctx.bezierCurveTo(cx + r * 1.25, cy - r * 0.1, cx + r * 0.5, cy - r * 1.05, cx, cy - r * 0.35)
  ctx.bezierCurveTo(cx - r * 0.5, cy - r * 1.05, cx - r * 1.25, cy - r * 0.1, cx, cy + r * 0.85)
  ctx.closePath()
}

function shapePath(ctx: CanvasRenderingContext2D, shape: string, cx: number, cy: number, r: number) {
  ctx.beginPath()
  switch (shape) {
    case 'square':
      roundRect(ctx, cx - r * 0.92, cy - r * 0.92, r * 1.84, r * 1.84, r * 0.28)
      break
    case 'diamond':
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      break
    case 'triangle':
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r * 0.92, cy + r * 0.8)
      ctx.lineTo(cx - r * 0.92, cy + r * 0.8)
      ctx.closePath()
      break
    case 'pin':
      ctx.moveTo(cx, cy + r * 1.15)
      ctx.bezierCurveTo(cx - r, cy + r * 0.25, cx - r, cy - r * 0.7, cx, cy - r)
      ctx.bezierCurveTo(cx + r, cy - r * 0.7, cx + r, cy + r * 0.25, cx, cy + r * 1.15)
      ctx.closePath()
      break
    case 'star':
      starPath(ctx, cx, cy, r, r * 0.46, 5)
      break
    case 'heart':
      heartPath(ctx, cx, cy, r)
      break
    case 'circle':
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
  }
}

/**
 * Draw a pin's icon onto a 2D context of the given square size.
 * `icon` is a shape keyword, an emoji, or null (→ default circle).
 */
export function drawPin(ctx: CanvasRenderingContext2D, size: number, icon: string | null, color: string) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.3
  ctx.clearRect(0, 0, size, size)

  if (!icon || isShape(icon)) {
    const shape = icon || 'circle'
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.shadowColor = color
    ctx.shadowBlur = size * 0.16
    ctx.fillStyle = color
    if (shape === 'ring') {
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      ctx.lineWidth = size * 0.045
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      shapePath(ctx, shape, cx, cy, r)
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.lineWidth = size * 0.05
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.stroke()
    }
    ctx.restore()
    return
  }

  // Emoji / free-form glyph — soft dark backdrop for contrast, then the glyph.
  ctx.save()
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.46)
  g.addColorStop(0, 'rgba(8,16,32,0.55)')
  g.addColorStop(0.55, 'rgba(8,16,32,0.28)')
  g.addColorStop(1, 'rgba(8,16,32,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.46, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = `${Math.round(size * 0.56)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(icon, cx, cy + size * 0.03)
  ctx.restore()
}

/** Build a sprite texture for a pin (128px canvas). */
export function makePinTexture(icon: string | null, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  drawPin(c.getContext('2d')!, 128, icon, color)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  return tex
}
