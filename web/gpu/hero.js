// Fondo de rejilla de la portada con vgpu (vercel-labs/vgpu, MIT): WebGPU, sin bloquear nada.
// Reglas: solo se pide si el navegador tiene WebGPU, no hay «reducir movimiento» ni ahorro de datos, la pantalla es
// ancha y la pestaña se ve; se pinta a 1× y a 30 fotogramas por segundo, y se para fuera de pantalla.
// Si algo falla, queda la rejilla estática de CSS (el ::before del héroe) y la portada se ve igual de bien.
import { effect, frameLoop, init, surface } from 'vgpu'
import shader from './hero-shader.json'

const hero = document.querySelector('.hero-v2')
const ahorro = navigator.connection && navigator.connection.saveData
const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const ancho = window.matchMedia('(min-width: 761px)')

let canvasActual = null, gpuActual = null, bucleActual = null
// Si algo falla (también cuando el error llega más tarde, desde la GPU), se quita el lienzo y se ve la rejilla de CSS.
function apagar() {
  hero.classList.remove('hero-gpu-on')
  try { bucleActual && bucleActual.stop && bucleActual.stop() } catch (_) {}
  try { gpuActual && gpuActual.dispose() } catch (_) {}
  canvasActual && canvasActual.remove()
  canvasActual = gpuActual = bucleActual = null
}
window.addEventListener('unhandledrejection', (e) => { if (canvasActual && /VGPU|WebGPU|GPU/.test(String(e.reason))) { e.preventDefault(); apagar() } })

async function arrancar() {
  const canvas = document.createElement('canvas')
  canvas.className = 'hero-gpu'
  canvas.setAttribute('aria-hidden', 'true')
  hero.prepend(canvas)
  canvasActual = canvas
  const gpu = await init()
  gpuActual = gpu
  const salida = surface(gpu, canvas, { dpr: [1, 1] })
  const rejilla = effect(gpu, shader, { set: { params: { time: 0, aspect: 1, pointer: [-1, -1], dark: 1 } } })
  let objetivo = [-1, -1], puntero = [-1, -1], visible = true, ultimo = 0, pintados = 0
  const oscuro = () => {
    const t = document.documentElement.dataset.theme
    return t ? t === 'dark' : !window.matchMedia('(prefers-color-scheme: light)').matches
  }
  const medir = () => {
    const r = canvas.getBoundingClientRect()
    rejilla.set({ params: { aspect: Math.max(r.width, 1) / Math.max(r.height, 1) } })
  }
  salida.onResize(medir)
  medir()
  hero.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    objetivo = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]
  }, { passive: true })
  hero.addEventListener('pointerleave', () => { objetivo = [-1, -1] })
  new IntersectionObserver(([e]) => { visible = e.isIntersecting }).observe(hero)
  const inicio = performance.now()
  const bucle = frameLoop(gpu, (frame) => {
    const ahora = performance.now()
    if (!visible || document.hidden || ahora - ultimo < 33) return
    ultimo = ahora
    puntero = [puntero[0] + (objetivo[0] - puntero[0]) * 0.12, puntero[1] + (objetivo[1] - puntero[1]) * 0.12]
    rejilla.set({ params: { time: (ahora - inicio) / 1000, pointer: puntero, dark: oscuro() ? 1 : 0 } })
    frame.pass(salida, rejilla)
    // Solo se enseña tras unos fotogramas pintados sin error: antes sigue la rejilla de CSS.
    if (++pintados === 6) setTimeout(() => { if (canvasActual) hero.classList.add('hero-gpu-on') }, 400)
  })
  bucleActual = bucle
  ancho.addEventListener('change', () => { if (!ancho.matches) apagar() })
  return bucle
}

if (hero && navigator.gpu && !quieto && !ahorro && ancho.matches) {
  const ir = () => arrancar().catch(apagar)
  if ('requestIdleCallback' in window) requestIdleCallback(ir, { timeout: 2500 })
  else setTimeout(ir, 800)
}
