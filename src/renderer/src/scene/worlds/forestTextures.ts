import * as THREE from 'three'
import { forestRandom } from './forestLayout'

function tile(size: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  return canvas.getContext('2d')!
}

function tiledTexture(ctx: CanvasRenderingContext2D) {
  const map = new THREE.CanvasTexture(ctx.canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.anisotropy = 8
  return map
}

export function barkTexture() {
  const size = 512, ctx = tile(size), random = forestRandom(198)
  ctx.fillStyle = '#655140'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 440; i++) {
    const x = random() * size, start = random() * size, length = 22 + random() ** 0.6 * 350
    const width = 1 + random() ** 2 * 11, phase = random() * Math.PI * 2
    const hue = 23 + random() * 22, shade = 13 + random() * 28
    for (const yOffset of [-size, 0]) for (const xOffset of [-size, 0, size]) {
      ctx.beginPath()
      for (let j = 0; j <= 10; j++) {
        const y = start + length * j / 10
        const px = x + Math.sin(y * 0.017 + phase) * 4 + Math.sin(y * 0.061 + phase) * 2 + xOffset
        if (j === 0) ctx.moveTo(px, y + yOffset); else ctx.lineTo(px, y + yOffset)
      }
      ctx.lineWidth = width
      ctx.strokeStyle = `hsl(${hue} 24% ${shade}% / 75%)`
      ctx.stroke()
      if (width > 4) {
        ctx.save(); ctx.translate(width * 0.43, 0)
        ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(205,172,123,.24)'; ctx.stroke(); ctx.restore()
      }
    }
  }
  for (let i = 0; i < 12000; i++) {
    const moss = random() < 0.42
    ctx.fillStyle = moss ? 'rgba(109,130,64,.23)' : random() > 0.5 ? 'rgba(23,15,12,.16)' : 'rgba(184,157,111,.14)'
    ctx.fillRect(random() * size, random() * size, 0.6 + random() * 2.4, 1 + random() * 5.5)
  }
  return tiledTexture(ctx)
}

export function forestSoilTexture() {
  const size = 1024, ctx = tile(size), random = forestRandom(113)
  ctx.fillStyle = '#524432'; ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 590; i++) {
    const x = random() * size, y = random() * size, radius = 10 + random() * 90
    const rgb = ['108,112,57', '43,38,30', '123,96,58', '75,87,49'][i % 4]
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      if (x + dx + radius < 0 || x + dx - radius > size || y + dy + radius < 0 || y + dy - radius > size) continue
      const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius)
      gradient.addColorStop(0, `rgba(${rgb},.46)`)
      gradient.addColorStop(1, `rgba(${rgb},0)`)
      ctx.fillStyle = gradient
      ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2)
    }
  }
  for (let i = 0; i < 25000; i++) {
    const shade = 20 + random() * 43
    ctx.fillStyle = `hsl(${27 + random() * 55} 24% ${shade}% / 35%)`
    ctx.fillRect(random() * size, random() * size, 0.7 + random() * 3.5, 0.7 + random() * 2.2)
  }
  for (let i = 0; i < 850; i++) {
    const w = 2 + random() * 4, h = w * (2 + random() * 1.8)
    ctx.save()
    ctx.translate(random() * size, random() * size); ctx.rotate(random() * Math.PI * 2)
    ctx.fillStyle = `hsl(${21 + random() * 55} 36% ${20 + random() * 30}%)`
    ctx.beginPath(); ctx.moveTo(0, -h / 2)
    ctx.quadraticCurveTo(w * 1.8, 0, 0, h / 2); ctx.quadraticCurveTo(-w * 1.8, 0, 0, -h / 2); ctx.fill()
    ctx.strokeStyle = 'rgba(225,192,129,.33)'; ctx.lineWidth = .85
    ctx.beginPath(); ctx.moveTo(0, -h * .42); ctx.lineTo(0, h * .48); ctx.stroke(); ctx.restore()
  }
  return tiledTexture(ctx)
}
