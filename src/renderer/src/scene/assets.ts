import * as THREE from 'three'

// Geometrías y texturas compartidas por toda la escena (se crean una sola vez).

export const GEO = {
  robotBody: new THREE.CapsuleGeometry(0.44, 0.26, 12, 28),
  // Visor: casquete esférico en la cara frontal (+Z).
  robotVisor: new THREE.SphereGeometry(0.455, 40, 24, Math.PI * 0.5 - 1.02, 2.04, Math.PI * 0.5 - 0.5, 0.86),
  robotEye: new THREE.CircleGeometry(0.075, 24),
  robotPod: new THREE.CylinderGeometry(0.09, 0.09, 0.06, 20),
  thinkDot: new THREE.SphereGeometry(0.045, 12, 8),
  waitArc: new THREE.TorusGeometry(0.17, 0.02, 8, 40, Math.PI * 1.35),
  hexBase: new THREE.CylinderGeometry(1.62, 1.46, 0.3, 6, 1),
  hexTop: new THREE.CylinderGeometry(1.44, 1.44, 0.04, 6, 1),
  hexRim: new THREE.TorusGeometry(1.6, 0.024, 6, 6),
  hexRimLow: new THREE.TorusGeometry(1.47, 0.016, 6, 6),
  pad: new THREE.TorusGeometry(0.72, 0.03, 8, 48),
  pulseRing: new THREE.RingGeometry(0.92, 1.0, 64),
  pedestal: new THREE.BoxGeometry(0.42, 0.5, 0.32),
  screenMain: new THREE.PlaneGeometry(1.2, 0.78),
  screenSmall: new THREE.PlaneGeometry(0.62, 0.42),
  glowPlane: new THREE.PlaneGeometry(1, 1),
  packetCard: new THREE.PlaneGeometry(0.34, 0.44),
  fragment: new THREE.OctahedronGeometry(0.13, 0),
  cube: new THREE.BoxGeometry(1, 1, 1)
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  draw(ctx)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Brillo radial blanco → transparente (halos, resplandores bajo plataformas). */
export const glowTexture = canvasTexture(128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
})

/** Símbolo de verificación (se tiñe con el color del material). */
export const checkTexture = canvasTexture(128, 128, (ctx) => {
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.arc(64, 64, 52, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 12
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(38, 66)
  ctx.lineTo(56, 84)
  ctx.lineTo(92, 46)
  ctx.stroke()
})

/** Icono de documento para paquetes y el núcleo. */
export const docTexture = canvasTexture(128, 160, (ctx) => {
  const r = 14
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(10 + r, 8)
  ctx.lineTo(88, 8)
  ctx.lineTo(118, 38)
  ctx.lineTo(118, 152 - r)
  ctx.quadraticCurveTo(118, 152, 118 - r, 152)
  ctx.lineTo(10 + r, 152)
  ctx.quadraticCurveTo(10, 152, 10, 152 - r)
  ctx.lineTo(10, 8 + r)
  ctx.quadraticCurveTo(10, 8, 10 + r, 8)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(88, 8)
  ctx.lineTo(88, 38)
  ctx.lineTo(118, 38)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  for (let i = 0; i < 5; i++) {
    const w = i === 0 ? 44 : 78 - (i % 2) * 18
    ctx.fillRect(28, 56 + i * 18, w, 7)
  }
})

/** Panel de texto holográfico para los muros laterales. */
export function wallTexture(title: string[], lines: string[], align: 'left' | 'right' = 'left'): THREE.CanvasTexture {
  return canvasTexture(512, 768, (ctx) => {
    ctx.clearRect(0, 0, 512, 768)
    ctx.textAlign = align
    const x = align === 'left' ? 46 : 466
    ctx.fillStyle = 'rgba(190,235,255,0.95)'
    ctx.font = 'italic 600 74px "Inter Variable", "Segoe UI", sans-serif'
    title.forEach((t, i) => ctx.fillText(t, x, 120 + i * 82))
    ctx.fillStyle = 'rgba(150,215,255,0.8)'
    ctx.font = 'italic 500 44px "Inter Variable", "Segoe UI", sans-serif'
    const top = 120 + title.length * 82 + 40
    lines.forEach((t, i) => ctx.fillText(t, x, top + i * 58))
    ctx.fillRect(align === 'left' ? x : x - 46, top + lines.length * 58 + 6, 46, 5)
  })
}
