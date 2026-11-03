import type { RobotAvatar } from '@shared/types'

/** Logos estilizados en una caja de 100×100. Se dibujan igual en 3D (canvas) y en los avatares (SVG). */
export interface LogoDef {
  fill?: string[]
  stroke?: string[]
  width?: number
  dots?: [number, number, number][]
}

function rot(x: number, y: number, a: number): [number, number] {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = x - 50
  const dy = y - 50
  return [50 + dx * c - dy * s, 50 + dx * s + dy * c]
}

function polyline(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
}

function claudeRays(): string[] {
  const out: string[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + (i % 3) * 0.05
    const r1 = 9
    const r2 = i % 2 ? 34 : 44
    out.push(
      polyline([
        [50 + Math.cos(a) * r1, 50 + Math.sin(a) * r1],
        [50 + Math.cos(a) * r2, 50 + Math.sin(a) * r2]
      ])
    )
  }
  return out
}

function qwenPieces(): string[] {
  const base: [number, number][] = [
    [30, 31],
    [57, 31],
    [68, 50]
  ]
  return [0, 1, 2].map((k) => polyline(base.map(([x, y]) => rot(x, y, (k * 2 * Math.PI) / 3))))
}

function openaiLoops(): string[] {
  const out: string[] = []
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3
    // Estadio (rectángulo de puntas redondas) desplazado del centro y girado.
    const w = 13
    const top = 18
    const bottom = 58
    const p = [
      rot(50 - w, top + w, a),
      rot(50 - w, bottom, a),
      rot(50 + w, bottom, a),
      rot(50 + w, top + w, a),
      rot(50, top, a)
    ]
    const [l1, l2, r2, r1, tip] = p
    out.push(
      `M${l2[0].toFixed(2)} ${l2[1].toFixed(2)} L${l1[0].toFixed(2)} ${l1[1].toFixed(2)} ` +
        `Q${rot(50 - w, top, a)[0].toFixed(2)} ${rot(50 - w, top, a)[1].toFixed(2)} ${tip[0].toFixed(2)} ${tip[1].toFixed(2)} ` +
        `Q${rot(50 + w, top, a)[0].toFixed(2)} ${rot(50 + w, top, a)[1].toFixed(2)} ${r1[0].toFixed(2)} ${r1[1].toFixed(2)} ` +
        `L${r2[0].toFixed(2)} ${r2[1].toFixed(2)}`
    )
  }
  return out
}

export const LOGOS: Record<Exclude<RobotAvatar['logo'], 'none'>, LogoDef> = {
  gemini: {
    fill: ['M50 6 C53 35 65 47 94 50 C65 53 53 65 50 94 C47 65 35 53 6 50 C35 47 47 35 50 6 Z']
  },
  claude: { stroke: claudeRays(), width: 6.5 },
  qwen: { stroke: qwenPieces(), width: 11 },
  openai: { stroke: openaiLoops(), width: 5.5 },
  // Chip genérico para modelos locales que no son Qwen.
  local: {
    stroke: ['M30 30 L70 30 L70 70 L30 70 Z', 'M42 42 L58 42 L58 58 L42 58 Z', 'M40 18 L40 30 M50 18 L50 30 M60 18 L60 30 M40 70 L40 82 M50 70 L50 82 M60 70 L60 82 M18 40 L30 40 M18 50 L30 50 M18 60 L30 60 M70 40 L82 40 M70 50 L82 50 M70 60 L82 60'],
    width: 6
  },
  // Caduceo de Hermes: bastón alado con dos serpientes enroscadas.
  hermes: {
    fill: [
      'M47 27 C38 19 24 16 6 18 C14 22 19 24 23 26 C16 26 12 27 8 30 C17 32 24 32 30 32 C25 34 22 36 19 39 C29 39 39 36 47 31 Z',
      'M53 27 C62 19 76 16 94 18 C86 22 81 24 77 26 C84 26 88 27 92 30 C83 32 76 32 70 32 C75 34 78 36 81 39 C71 39 61 36 53 31 Z'
    ],
    stroke: [
      'M50 18 L50 95',
      'M58 40 C66 44 63 51 50 55 C37 59 37 67 50 71 C61 74 61 82 50 87',
      'M42 40 C34 44 37 51 50 55 C63 59 63 67 50 71 C39 74 39 82 50 87'
    ],
    width: 5,
    dots: [
      [50, 12, 6],
      [59, 39, 3.6],
      [41, 39, 3.6]
    ]
  },
  becario: {
    stroke: ['M38 30 L38 70', 'M38 58 A17 17 0 1 1 38 59.5'],
    width: 9,
    dots: [[38, 22, 8]]
  },
  // Garabato de Muse (Meta): una línea ondulada que sube y baja en tres trazos.
  muse: {
    stroke: ['M6 50 Q22 14 22 50 Q22 84 36 54 Q50 22 49 52 Q48 84 62 58 Q76 30 77 56 Q78 84 88 70 L95 58'],
    width: 10
  }
}

/** Dibuja un logo en un canvas 2D (blanco; el material lo tiñe). */
export function drawLogo(ctx: CanvasRenderingContext2D, logo: LogoDef, size: number): void {
  ctx.save()
  ctx.scale(size / 100, size / 100)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = logo.width ?? 6
  for (const d of logo.fill ?? []) ctx.fill(new Path2D(d))
  for (const d of logo.stroke ?? []) ctx.stroke(new Path2D(d))
  for (const [x, y, r] of logo.dots ?? []) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
