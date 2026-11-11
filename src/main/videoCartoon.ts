// Estilo cartoon del estudio de vídeo: un presentador dibujado (SVG hecho aquí, siempre el mismo en todo el vídeo) que
// habla moviendo la boca al ritmo de la voz, parpadea y cambia de gesto en cada escena, al lado de una tarjeta con la
// ilustración del paso, su número y lo que hay que hacer; subtítulos al ritmo de la voz y reacciones en las bromas.
// Todo determinista (HyperFrames salta de fotograma en fotograma).
import {
  beatsOf,
  esc,
  rng,
  round,
  THEMES,
  sceneWords,
  speakerChip,
  VOICE_LEAD_S,
  type CharacterPose,
  type Composition,
  type CompositionInput,
  type TimedWord
} from './videoScript'

interface Pose {
  /** Brazo izquierdo y derecho (grados en el hombro; 0 = colgando) y antebrazos (grados en el codo). */
  aL: number
  fL: number
  aR: number
  fR: number
  /** Giro de la cabeza. */
  head: number
  /** Cejas: cuánto suben (px, negativo = arriba). */
  brow: number
  /** Tamaño de los ojos. */
  eye: number
  /** Ojos de risa (^ ^). */
  happy: number
  /** Pulgar arriba visible. */
  thumb: number
  /** Hacia dónde miran las pupilas. */
  lookX: number
  lookY: number
}

const POSES: Record<CharacterPose | 'idle', Pose> = {
  idle: { aL: 8, fL: 0, aR: -8, fR: 0, head: 0, brow: 0, eye: 1, happy: 0, thumb: 0, lookX: 0, lookY: 0 },
  explain: { aL: 12, fL: 10, aR: -28, fR: -75, head: -3, brow: -2, eye: 1, happy: 0, thumb: 0, lookX: 0, lookY: 0 },
  point: { aL: 10, fL: 0, aR: -112, fR: -12, head: 5, brow: -4, eye: 1, happy: 0, thumb: 0, lookX: 7, lookY: -2 },
  surprised: { aL: 150, fL: 25, aR: -150, fR: -25, head: 0, brow: -16, eye: 1.3, happy: 0, thumb: 0, lookX: 0, lookY: 0 },
  laugh: { aL: -25, fL: -95, aR: 25, fR: 95, head: -6, brow: -6, eye: 1, happy: 1, thumb: 0, lookX: 0, lookY: 0 },
  shrug: { aL: 55, fL: -110, aR: -55, fR: 110, head: 9, brow: -10, eye: 1, happy: 0, thumb: 0, lookX: 0, lookY: 0 },
  thumbs: { aL: 8, fL: 0, aR: -50, fR: -95, head: -4, brow: -3, eye: 1, happy: 1, thumb: 1, lookX: 0, lookY: 0 },
  think: { aL: -15, fL: -80, aR: 18, fR: 150, head: 7, brow: -8, eye: 1, happy: 0, thumb: 0, lookX: 5, lookY: -7 },
  wave: { aL: 8, fL: 0, aR: -150, fR: -20, head: -5, brow: -6, eye: 1, happy: 0, thumb: 0, lookX: 0, lookY: 0 }
}

// Puntos de giro del muñeco (coordenadas del SVG, 400 x 760).
const SHOULDER_L = '118 336'
const SHOULDER_R = '282 336'
const ELBOW_L = '118 446'
const ELBOW_R = '282 446'
const NECK = '200 310'
const MOUTH = '200 257'
const EYES = '200 200'

const INK = '#1d1a2b'
const SKIN = '#f4c7a1'
const SKIN_SHADE = '#e3a983'
const HAIR = '#3b2416'
const JEANS = '#34437c'

/** El presentador (estilo chibi: cabeza grande, sudadera con capucha, sombras suaves). `shirt` es el color de la sudadera. */
function characterSvg(shirt: string): string {
  const arm = (side: 'L' | 'R'): string => {
    const x = side === 'L' ? 118 : 282
    return `<g id="arm${side}">
      <rect x="${x - 25}" y="320" width="50" height="136" rx="25" fill="${shirt}" stroke="${INK}" stroke-width="6"/>
      <rect x="${x - 25}" y="320" width="50" height="136" rx="25" fill="url(#shade)"/>
      <g id="fore${side}">
        <rect x="${x - 23}" y="428" width="46" height="70" rx="20" fill="${shirt}" stroke="${INK}" stroke-width="6"/>
        <rect x="${x - 23}" y="484" width="46" height="16" rx="6" fill="rgba(0,0,0,0.18)" stroke="${INK}" stroke-width="5"/>
        <rect x="${x - 17}" y="496" width="34" height="40" rx="14" fill="url(#skin)" stroke="${INK}" stroke-width="6"/>
        <circle cx="${x}" cy="548" r="30" fill="url(#skin)" stroke="${INK}" stroke-width="6"/>
        <path d="M${x - 14} 560 Q${x} 568 ${x + 14} 560" fill="none" stroke="${SKIN_SHADE}" stroke-width="5" stroke-linecap="round"/>
        ${side === 'R' ? `<g id="thumb" opacity="0"><rect x="${x - 12}" y="552" width="24" height="56" rx="12" fill="url(#skin)" stroke="${INK}" stroke-width="6"/></g>` : ''}
      </g>
    </g>`
  }
  return `<svg viewBox="0 0 400 760" width="100%" height="100%" style="overflow: visible" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="skin" cx="40%" cy="35%" r="75%"><stop offset="0%" stop-color="#ffe0c4"/><stop offset="70%" stop-color="${SKIN}"/><stop offset="100%" stop-color="${SKIN_SHADE}"/></radialGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fff" stop-opacity="0.28"/><stop offset="45%" stop-color="#fff" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.22"/></linearGradient>
    <linearGradient id="hairG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5a3622"/><stop offset="100%" stop-color="${HAIR}"/></linearGradient>
    <linearGradient id="jeansG" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#4657a0"/><stop offset="100%" stop-color="${JEANS}"/></linearGradient>
  </defs>
  <ellipse cx="200" cy="742" rx="140" ry="17" fill="rgba(0,0,0,0.25)"/>
  <g id="ch">
    <rect x="144" y="500" width="50" height="210" rx="22" fill="url(#jeansG)" stroke="${INK}" stroke-width="6"/>
    <rect x="206" y="500" width="50" height="210" rx="22" fill="url(#jeansG)" stroke="${INK}" stroke-width="6"/>
    <path d="M110 726 Q110 690 160 690 Q200 690 200 718 Q200 738 160 738 Q110 738 110 726 Z" fill="#f4f4f6" stroke="${INK}" stroke-width="6"/>
    <path d="M290 726 Q290 690 240 690 Q200 690 200 718 Q200 738 240 738 Q290 738 290 726 Z" fill="#f4f4f6" stroke="${INK}" stroke-width="6"/>
    <path d="M114 724 L196 724 M204 724 L286 724" stroke="${shirt}" stroke-width="7"/>
    <g id="torso">
      <path d="M150 300 Q200 268 250 300 L258 318 Q200 300 142 318 Z" fill="${shirt}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <rect x="104" y="300" width="192" height="238" rx="64" fill="${shirt}" stroke="${INK}" stroke-width="6"/>
      <rect x="104" y="300" width="192" height="238" rx="64" fill="url(#shade)"/>
      <path d="M140 446 Q200 430 260 446 L256 500 Q200 512 144 500 Z" fill="rgba(0,0,0,0.14)" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M182 314 L180 368 M218 314 L220 368" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
      <circle cx="180" cy="372" r="6" fill="#fff" stroke="${INK}" stroke-width="3"/><circle cx="220" cy="372" r="6" fill="#fff" stroke="${INK}" stroke-width="3"/>
      <rect x="232" y="396" width="12" height="40" rx="5" fill="#ff4d4d" stroke="${INK}" stroke-width="4" transform="rotate(18 238 416)"/>
      <rect x="238" y="382" width="6" height="18" rx="2" fill="#c9ced8" stroke="${INK}" stroke-width="3" transform="rotate(18 238 416)"/>
    </g>
    ${arm('L')}
    ${arm('R')}
    <g id="head">
      <rect x="182" y="282" width="36" height="30" fill="${SKIN_SHADE}" stroke="${INK}" stroke-width="6"/>
      <circle cx="78" cy="206" r="24" fill="url(#skin)" stroke="${INK}" stroke-width="6"/>
      <circle cx="322" cy="206" r="24" fill="url(#skin)" stroke="${INK}" stroke-width="6"/>
      <path d="M72 200 Q78 214 88 204 M328 200 Q322 214 312 204" fill="none" stroke="${SKIN_SHADE}" stroke-width="5" stroke-linecap="round"/>
      <path d="M76 196 C 76 100, 136 66, 200 66 C 264 66, 324 100, 324 196 C 324 268, 270 304, 200 304 C 130 304, 76 268, 76 196 Z" fill="url(#skin)" stroke="${INK}" stroke-width="6"/>
      <path d="M78 180 C 70 96, 138 52, 214 56 C 292 60, 336 112, 322 180 C 312 146, 296 128, 272 118 C 276 136, 262 150, 240 146 C 246 130, 238 116, 226 110 C 214 132, 176 140, 150 124 C 152 140, 138 152, 118 150 C 104 158, 88 168, 78 180 Z" fill="url(#hairG)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M150 84 Q190 66 236 76" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="9" stroke-linecap="round"/>
      <path d="M196 60 Q214 26 246 34 Q226 42 222 62" fill="url(#hairG)" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <ellipse cx="124" cy="246" rx="20" ry="13" fill="#ff7f8a" opacity="0.5"/>
      <ellipse cx="276" cy="246" rx="20" ry="13" fill="#ff7f8a" opacity="0.5"/>
      <g id="eyes">
        <g id="eyesOpen">
          <ellipse cx="158" cy="200" rx="25" ry="30" fill="#fff" stroke="${INK}" stroke-width="4"/>
          <ellipse cx="242" cy="200" rx="25" ry="30" fill="#fff" stroke="${INK}" stroke-width="4"/>
          <g id="pupils"><ellipse cx="160" cy="204" rx="14" ry="16" fill="#3a2a1e"/><ellipse cx="244" cy="204" rx="14" ry="16" fill="#3a2a1e"/>
          <circle cx="160" cy="206" r="7" fill="${INK}"/><circle cx="244" cy="206" r="7" fill="${INK}"/>
          <circle cx="166" cy="197" r="5" fill="#fff"/><circle cx="250" cy="197" r="5" fill="#fff"/>
          <circle cx="155" cy="211" r="2.5" fill="#fff"/><circle cx="239" cy="211" r="2.5" fill="#fff"/></g>
        </g>
        <g id="eyesHappy" opacity="0">
          <path d="M136 208 Q158 180 180 208" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
          <path d="M220 208 Q242 180 264 208" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        </g>
      </g>
      <g id="glasses" fill="rgba(200,230,255,0.16)" stroke="${INK}" stroke-width="6">
        <rect x="118" y="164" width="80" height="74" rx="30"/><rect x="202" y="164" width="80" height="74" rx="30"/>
        <path d="M196 196 Q200 188 204 196" fill="none"/>
        <path d="M128 176 L146 170" stroke="#fff" stroke-opacity="0.7" stroke-width="5" stroke-linecap="round"/>
      </g>
      <g id="brows">
        <path id="browL" d="M128 146 Q156 132 186 142" fill="none" stroke="${HAIR}" stroke-width="10" stroke-linecap="round"/>
        <path id="browR" d="M214 142 Q244 132 272 146" fill="none" stroke="${HAIR}" stroke-width="10" stroke-linecap="round"/>
      </g>
      <path d="M200 228 Q208 240 198 246" fill="none" stroke="${SKIN_SHADE}" stroke-width="5" stroke-linecap="round"/>
      <g id="mouth">
        <path d="M166 256 Q200 262 234 256 Q230 298 200 298 Q170 298 166 256 Z" fill="#6b1f2a" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
        <path d="M174 260 Q200 265 226 260 L224 268 Q200 272 176 268 Z" fill="#fff"/>
        <ellipse cx="200" cy="288" rx="18" ry="8" fill="#ff7a8a"/>
      </g>
    </g>
  </g>
</svg>`
}

/** Sílabas aproximadas de una palabra (para abrir la boca tantas veces). */
function syllables(word: string): number {
  const m = word.toLowerCase().match(/[aeiouáéíóúüàèìòùâêîôûy]+/g)
  return Math.max(1, Math.min(4, m ? m.length : 1))
}

/** «¡JA!» de las bromas en el idioma del vídeo. */
function laughWord(lang: string): string {
  return lang === 'es' ? '¡JA, JA!' : lang === 'pt' ? 'HA, HA!' : lang === 'fr' ? 'HA, HA !' : lang === 'it' ? 'AH, AH!' : 'HA HA!'
}

function stepWord(lang: string): string {
  return lang === 'es' ? 'PASO' : lang === 'pt' ? 'PASSO' : lang === 'fr' ? 'ÉTAPE' : lang === 'it' ? 'PASSO' : 'STEP'
}

export function buildCartoonComposition(input: CompositionInput): Composition {
  const { script, format, timeline: tl } = input
  const shotsOf = input.shots ?? input.images.map((x) => [x])
  const vertical = format === 'vertical'
  const W = vertical ? 1080 : 1920
  const H = vertical ? 1920 : 1080
  const th = THEMES[script.theme]
  const font = "'Arial Rounded MT Bold', 'Nunito', 'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif"
  const R = (n: number): number => round(n)
  const r = rng(script.title.length * 104729 + script.scenes.length * 31)
  const a: string[] = []
  const scenes: string[] = []
  const clipHtml: string[] = []
  const sfx: Composition['sfx'] = []

  // Lo que se ve manda: la ilustración del paso ocupa toda la pantalla; el personaje, en una esquina, señala y reacciona;
  // subtítulos en una franja abajo.
  // Con un personaje elegido, el presentador es su imagen (en el estilo del vídeo) en una tarjeta en la esquina.
  const host = input.presenter
  const svg = !host
  const ch = host
    ? vertical
      ? { left: 700, top: 1380, w: 340, h: 430 }
      : { left: 24, top: 610, w: 290, h: 370 }
    : vertical
      ? { left: 700, top: 1290, w: 350, h: 665 }
      : { left: 14, top: 560, w: 290, h: 551 }
  const cap = vertical ? { left: 40, top: 1090, w: 1000, h: 180 } : { left: 330, top: 905, w: 1560, h: 150 }

  // ---------- personaje ----------
  if (svg)
    a.push(
    `gsap.set('#armL', {svgOrigin: '${SHOULDER_L}'})`,
    `gsap.set('#armR', {svgOrigin: '${SHOULDER_R}'})`,
    `gsap.set('#foreL', {svgOrigin: '${ELBOW_L}'})`,
    `gsap.set('#foreR', {svgOrigin: '${ELBOW_R}'})`,
    `gsap.set('#head', {svgOrigin: '${NECK}'})`,
    `gsap.set('#mouth', {svgOrigin: '${MOUTH}', scaleY: 0.22})`,
    `gsap.set('#eyes', {svgOrigin: '${EYES}'})`
  )
  let prev: Pose = POSES.idle
  const poseTo = (p: Pose, at: number, dur = 0.38): void => {
    if (!svg) return
    const q = prev
    const e = 'back.out(1.8)'
    const f = `immediateRender: false`
    a.push(
      `tl.fromTo('#armL', {rotation: ${q.aL}}, {rotation: ${p.aL}, duration: ${dur}, ease: '${e}', ${f}}, ${R(at)})`,
      `tl.fromTo('#foreL', {rotation: ${q.fL}}, {rotation: ${p.fL}, duration: ${dur}, ease: '${e}', ${f}}, ${R(at)})`,
      `tl.fromTo('#armR', {rotation: ${q.aR}}, {rotation: ${p.aR}, duration: ${dur}, ease: '${e}', ${f}}, ${R(at)})`,
      `tl.fromTo('#foreR', {rotation: ${q.fR}}, {rotation: ${p.fR}, duration: ${dur}, ease: '${e}', ${f}}, ${R(at)})`,
      `tl.fromTo('#head', {rotation: ${q.head}}, {rotation: ${p.head}, duration: ${dur}, ease: 'power2.out', ${f}}, ${R(at)})`,
      `tl.fromTo('#brows', {y: ${q.brow}}, {y: ${p.brow}, duration: 0.25, ease: 'power2.out', ${f}}, ${R(at)})`,
      `tl.fromTo('#eyesOpen', {scale: ${q.eye}}, {scale: ${p.eye}, svgOrigin: '${EYES}', duration: 0.25, ease: 'back.out(3)', ${f}}, ${R(at)})`,
      `tl.fromTo('#pupils', {x: ${q.lookX}, y: ${q.lookY}}, {x: ${p.lookX}, y: ${p.lookY}, duration: 0.25, ${f}}, ${R(at)})`,
      `tl.set('#eyesOpen', {opacity: ${p.happy ? 0 : 1}}, ${R(at + 0.1)})`,
      `tl.set('#eyesHappy', {opacity: ${p.happy ? 1 : 0}}, ${R(at + 0.1)})`,
      `tl.set('#thumb', {opacity: ${p.thumb}}, ${R(at + 0.15)})`
    )
    prev = p
  }
  const pose = (name: CharacterPose | 'idle'): Pose => {
    const p = POSES[name]
    if (name !== 'point') return p
    // Señala al centro de la pantalla desde su esquina: hacia arriba a la derecha, o a la izquierda en vertical.
    return vertical
      ? { ...p, aL: 140, fL: 12, aR: -8, fR: 0, head: -6, lookX: -7, lookY: -8 }
      : { ...p, aR: -128, fR: -10, head: 6, lookX: 7, lookY: -6 }
  }

  // Respira todo el vídeo y parpadea cada pocos segundos (la imagen de un personaje elegido solo respira).
  if (!svg) a.push(`tl.fromTo('#hostimg', {scaleY: 1}, {scaleY: 1.02, transformOrigin: '50% 100%', duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor(tl.total / 1.4))}}, 0)`)
  else a.push(`tl.fromTo('#torso', {scaleY: 1}, {scaleY: 1.018, transformOrigin: '50% 100%', duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor(tl.total / 1.4))}}, 0)`)
  for (let t = 1.6; svg && t < tl.total - 0.5; t += 2.4 + r() * 2.2) {
    a.push(`tl.fromTo('#eyes', {scaleY: 1}, {scaleY: 0.08, duration: 0.07, ease: 'power1.in', yoyo: true, repeat: 1, immediateRender: false}, ${R(t)})`)
  }

  // Entrada: sale de abajo de un salto y saluda.
  a.push(`tl.fromTo('#char', {y: ${ch.h}}, {y: 0, duration: 0.5, ease: 'back.out(1.6)'}, 0.1)`)
  poseTo(pose('wave'), 0.5)
  if (svg) a.push(`tl.fromTo('#foreR', {rotation: -20}, {rotation: 25, duration: 0.22, ease: 'sine.inOut', yoyo: true, repeat: 5, immediateRender: false}, 0.9)`)
  else a.push(`tl.fromTo('#hostimg', {rotation: -6}, {rotation: 6, transformOrigin: '50% 100%', duration: 0.25, ease: 'sine.inOut', yoyo: true, repeat: 3, immediateRender: false}, 0.9)`)
  sfx.push({ at: 0.5, kind: 'pop' })

  // Boca al ritmo de la voz, palabra a palabra y sílaba a sílaba.
  const lip = (words: TimedWord[], start: number, voice: number): void => {
    words.forEach((w, j) => {
      const end = j + 1 < words.length ? words[j + 1].start : start + voice
      const pause = /[.!?…]$/.test(w.text) ? 6 : /[,;:]$/.test(w.text) ? 3 : 0
      const letters = w.text.replace(/[^\p{L}\p{N}]/gu, '').length + 2
      const speak = (end - w.start) * (letters / (letters + pause))
      const n = syllables(w.text)
      const d = speak / n
      for (let k = 0; k < n; k++) {
        const s = w.start + k * d
        const open = R(0.55 + r() * 0.45)
        if (!svg) {
          // La imagen no tiene boca: un pequeño rebote por sílaba, para que se vea que habla.
          a.push(`tl.fromTo('#hostimg', {y: 0}, {y: ${R(-4 - open * 6)}, duration: ${R(Math.max(0.04, d * 0.45))}, ease: 'power1.out', immediateRender: false}, ${R(s)})`)
          a.push(`tl.fromTo('#hostimg', {y: ${R(-4 - open * 6)}}, {y: 0, duration: ${R(Math.max(0.04, d * 0.45))}, ease: 'power1.in', immediateRender: false}, ${R(s + d * 0.5)})`)
          continue
        }
        a.push(`tl.fromTo('#mouth', {scaleY: 0.22}, {scaleY: ${open}, duration: ${R(Math.max(0.04, d * 0.45))}, ease: 'power1.out', immediateRender: false}, ${R(s)})`)
        a.push(`tl.fromTo('#mouth', {scaleY: ${open}}, {scaleY: 0.22, duration: ${R(Math.max(0.04, d * 0.45))}, ease: 'power1.in', immediateRender: false}, ${R(s + d * 0.5)})`)
      }
    })
  }

  // ---------- portada ----------
  const titleWords = script.title.split(/\s+/).filter(Boolean)
  scenes.push(`<section id="intro" class="clip" data-start="0" data-duration="${R(tl.intro + 0.3)}">
  <div class="board"><h1 class="title">${titleWords.map((w, i) => `<span class="tw" id="tw${i}">${esc(w)}</span>`).join(' ')}</h1></div>
</section>`)
  titleWords.forEach((_, i) => {
    const at = R(0.2 + i * Math.min(0.2, 1.1 / titleWords.length))
    a.push(`tl.fromTo('#tw${i}', {scale: 2.6, opacity: 0, rotation: ${i % 2 ? 8 : -8}}, {scale: 1, opacity: 1, rotation: 0, duration: 0.22, ease: 'power4.in'}, ${at})`)
    sfx.push({ at: R(at + 0.2), kind: i === titleWords.length - 1 ? 'impact' : 'pop' })
  })

  // ---------- escenas: cada paso, sus planos a pantalla completa ----------
  script.scenes.forEach((sc, i) => {
    const t = tl.scenes[i]
    const id = `s${i + 1}`
    // Mixto: en una escena de texto, las palabras en grande y el presentador se aparta.
    const textScene = !!sc.text
    const clip = textScene ? null : input.clips?.[i] ?? null
    const shots = clip || textScene ? [] : (shotsOf[i] ?? []).filter((x): x is string => !!x)
    // La animación de Manim va debajo de la escena (un <video> no puede ir dentro de algo con tiempo).
    if (clip) clipHtml.push(`<video id="${id}m" class="clip manimv" src="${esc(clip)}" muted playsinline data-start="${t.start}" data-duration="${t.duration}"></video>`)
    const voiceAt = t.start + VOICE_LEAD_S
    const words = sceneWords(sc, voiceAt, t.voice)
    const beats = beatsOf(words)
    const shotLen = shots.length ? t.duration / shots.length : t.duration
    const shotHtml = clip
      ? ''
      : shots.length
      ? shots
          .map((src, k) => {
            const s = R(t.start + k * shotLen)
            const ring = k === shots.length - 1 && (shots.length > 1 || sc.step) ? `<div class="ring" id="${id}k${k}ring"></div>` : ''
            return `<div class="clip shot" id="${id}k${k}" data-start="${s}" data-duration="${R(shotLen + (k + 1 < shots.length ? 0.05 : 0))}"><img src="${esc(src)}" alt="">${ring}</div>`
          })
          .join('\n  ')
      : `<div class="board"><div class="btext">${sc.heading.split(/\s+/).map((w, k) => `<span class="bw" id="${id}bw${k}">${esc(w)}</span>`).join(' ')}</div></div>`
    const top = !textScene && (shots.length || clip || sc.step)
      ? `<div class="top" id="${id}top">${sc.step ? `<div class="badge"><small>${stepWord(script.lang)}</small><b>${sc.step}</b></div>` : ''}${shots.length || clip ? `<div class="instr"><span>${esc(sc.heading)}</span></div>` : ''}</div>`
      : ''
    const joke = sc.joke ? `<div class="ja" id="${id}ja"><span>${esc(laughWord(script.lang))}</span></div>` : ''
    const capHtml = beats
      .map((b, k) => {
        const s = b[0].start
        const e = k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        return `<div class="clip cap" id="${id}c${k}" data-start="${R(s - 0.05)}" data-duration="${R(e - s + 0.05)}"><div class="ct">${speakerChip(script, b[0].who, th)}${b
          .map((w, j) => `<span class="w${w.key ? ' key' : ''}" id="${id}c${k}w${j}">${esc(w.text)}</span>`)
          .join(' ')}</div></div>`
      })
      .join('\n  ')
    scenes.push(`<section id="${id}" class="clip" data-start="${t.start}" data-duration="${t.duration}">
  ${shotHtml}
  <div class="flash" id="${id}flash"></div>
  ${top}${joke}
  ${capHtml}
</section>`)

    // Corte de entrada: destello, whoosh y la imagen que se asienta.
    sfx.push({ at: R(t.start - 0.08), kind: 'whoosh' })
    a.push(`tl.fromTo('#${id}flash', {opacity: 0.85}, {opacity: 0, duration: 0.3, ease: 'power2.out'}, ${R(t.start)})`)
    if (shots.length) {
      shots.forEach((_, k) => {
        const s = t.start + k * shotLen
        const sel = `#${id}k${k} img`
        // Cada plano entra con un pequeño golpe y se acerca despacio al centro (donde está lo importante).
        a.push(`tl.fromTo('${sel}', {scale: ${k ? 1.35 : 1.2}}, {scale: 1.04, duration: 0.45, ease: 'expo.out'}, ${R(s)})`)
        a.push(`tl.fromTo('${sel}', {scale: 1.04}, {scale: ${k === shots.length - 1 ? 1.2 : 1.12}, duration: ${R(Math.max(0.5, shotLen - 0.45))}, ease: 'none', immediateRender: false}, ${R(s + 0.45)})`)
        if (k) {
          a.push(`tl.fromTo('#${id}flash', {opacity: 0.6}, {opacity: 0, duration: 0.22, ease: 'power2.out', immediateRender: false}, ${R(s)})`)
          sfx.push({ at: R(s - 0.03), kind: 'pop' })
        }
        if (k === shots.length - 1 && (shots.length > 1 || sc.step)) {
          a.push(`tl.fromTo('#${id}k${k}ring', {scale: 2.4, opacity: 0}, {scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)'}, ${R(s + 0.5)})`)
          a.push(`tl.fromTo('#${id}k${k}ring', {scale: 1}, {scale: 1.12, duration: 0.4, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor((shotLen - 1) / 0.4))}, immediateRender: false}, ${R(s + 0.9)})`)
          sfx.push({ at: R(s + 0.5), kind: 'pop' })
        }
      })
    } else if (!clip) {
      sc.heading.split(/\s+/).forEach((_, k) => {
        a.push(`tl.fromTo('#${id}bw${k}', {scale: 0, rotation: ${k % 2 ? 10 : -10}}, {scale: 1, rotation: 0, duration: 0.4, ease: 'back.out(2.5)'}, ${R(t.start + 0.2 + k * 0.12)})`)
      })
    }
    if (top) {
      a.push(`tl.fromTo('#${id}top', {x: -700}, {x: 0, duration: 0.45, ease: 'back.out(1.6)'}, ${R(t.start + 0.15)})`)
      if (sc.step) sfx.push({ at: R(t.start + 0.2), kind: 'pop' })
    }

    if (textScene) {
      const off = vertical ? ch.w + 80 : -(ch.left + ch.w + 80)
      a.push(`tl.fromTo('#char', {x: 0}, {x: ${off}, duration: 0.3, ease: 'power2.in', immediateRender: false}, ${R(t.start)})`)
      a.push(`tl.fromTo('#char', {x: ${off}}, {x: 0, duration: 0.35, ease: 'back.out(1.6)', immediateRender: false}, ${R(t.start + t.duration - 0.05)})`)
    }
    // El personaje: brinco al cambiar, su gesto y gestos pequeños mientras habla.
    a.push(`tl.fromTo('#char', {y: 0}, {y: -30, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false}, ${R(t.start)})`)
    const p = pose(sc.joke ? 'laugh' : sc.pose ?? 'explain')
    poseTo(p, t.start + 0.05)
    if (!svg && sc.pose === 'point' && !sc.joke) a.push(`tl.fromTo('#hostimg', {rotation: 0}, {rotation: ${vertical ? -7 : 7}, transformOrigin: '50% 100%', duration: 0.3, ease: 'power2.out', immediateRender: false}, ${R(t.start + 0.1)})`, `tl.to('#hostimg', {rotation: 0, duration: 0.3, ease: 'power2.inOut'}, ${R(t.start + t.duration - 0.3)})`)
    if (svg && sc.pose === 'point' && !sc.joke) {
      const fore = vertical ? 'foreL' : 'foreR'
      const base = vertical ? p.fL : p.fR
      a.push(`tl.fromTo('#${fore}', {rotation: ${base}}, {rotation: ${base + (vertical ? 10 : -10)}, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor((t.duration - 0.8) / 0.3))}, immediateRender: false}, ${R(t.start + 0.5)})`)
    }
    if (sc.pose === 'surprised' && !sc.joke) {
      a.push(`tl.fromTo('#char', {y: 0}, {y: -80, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false}, ${R(t.start + 0.4)})`)
      sfx.push({ at: R(t.start + 0.4), kind: 'boing' })
    }
    if (sc.joke) {
      a.push(`tl.fromTo('#ch', {rotation: -2}, {rotation: 2, ${svg ? "svgOrigin: '200 720'" : "transformOrigin: '50% 100%'"}, duration: 0.09, ease: 'sine.inOut', yoyo: true, repeat: 15, immediateRender: false}, ${R(t.start + 0.4)})`)
      a.push(`tl.fromTo('#${id}ja', {scale: 0, rotation: -20}, {scale: 1, rotation: 8, duration: 0.4, ease: 'back.out(3)'}, ${R(t.start + 0.45)})`)
      a.push(`tl.to('#${id}ja', {scale: 1.12, duration: 0.25, ease: 'sine.inOut', yoyo: true, repeat: 3}, ${R(t.start + 0.85)})`)
      sfx.push({ at: R(t.start + 0.45), kind: 'boing' })
    }
    if (svg && (sc.pose ?? 'explain') === 'explain' && !sc.joke) {
      a.push(`tl.fromTo('#foreR', {rotation: ${p.fR}}, {rotation: ${p.fR - 22}, duration: 0.45, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor((t.duration - 0.8) / 0.45))}, immediateRender: false}, ${R(t.start + 0.5)})`)
    }
    beats.forEach((b, k) => {
      if (svg) a.push(`tl.fromTo('#head', {rotation: ${p.head + (k % 2 ? 3 : -3)}}, {rotation: ${p.head}, duration: 0.3, ease: 'power2.out', immediateRender: false}, ${R(b[0].start)})`)
    })
    lip(words, voiceAt, t.voice)

    // Subtítulos: la palabra que suena, resaltada.
    beats.forEach((b, k) => {
      a.push(`tl.fromTo('#${id}c${k} .ct', {y: 24, opacity: 0}, {y: 0, opacity: 1, duration: 0.18, ease: 'back.out(2.5)'}, ${R(b[0].start - 0.05)})`)
      b.forEach((w, j) => {
        const wid = `#${id}c${k}w${j}`
        const next = j + 1 < b.length ? b[j + 1].start : k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        const rest = w.key ? th.accent : '#ffffff'
        a.push(`tl.set('${wid}', {backgroundColor: '${w.key ? th.accent2 : th.accent}', color: '${w.key ? '#ffffff' : th.onAccent}'}, ${R(w.start)})`)
        a.push(`tl.set('${wid}', {backgroundColor: 'rgba(0,0,0,0)', color: '${rest}'}, ${R(Math.max(w.start + 0.12, next - 0.02))})`)
      })
    })
  })

  // ---------- cierre: pulgar arriba ----------
  const outWords = script.outro.split(/\s+/).filter(Boolean)
  scenes.push(`<section id="outro" class="clip" data-start="${tl.outroStart}" data-duration="${tl.outro}">
  <div class="board"><h2 class="title outro">${outWords.map((w, i) => `<span class="tw" id="ow${i}">${esc(w)}</span>`).join(' ')}</h2></div>
  <div class="flash" id="outflash"></div>
</section>`)
  a.push(`tl.fromTo('#outflash', {opacity: 0.85}, {opacity: 0, duration: 0.3, ease: 'power2.out'}, ${R(tl.outroStart)})`)
  sfx.push({ at: R(tl.outroStart - 0.08), kind: 'whoosh' })
  outWords.forEach((_, i) => {
    a.push(`tl.fromTo('#ow${i}', {y: 80, opacity: 0}, {y: 0, opacity: 1, duration: 0.3, ease: 'back.out(2.5)'}, ${R(tl.outroStart + 0.2 + i * 0.1)})`)
  })
  poseTo(pose('thumbs'), tl.outroStart + 0.1)
  a.push(`tl.fromTo('#char', {y: 0}, {y: -60, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false}, ${R(tl.outroStart + 0.1)})`)
  sfx.push({ at: R(tl.outroStart + 0.25 + outWords.length * 0.1), kind: 'impact' })
  a.push(`tl.to('#outro .title, #char', {opacity: 0, duration: 0.45, ease: 'power2.in'}, ${R(tl.total - 0.5)})`)
  a.push(`tl.fromTo('#bar', {scaleX: 0}, {scaleX: 1, duration: ${tl.total}, ease: 'none'}, 0)`)

  const doc = `<!doctype html>
<html lang="${esc(script.lang)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="${esc(input.gsap)}"></script>
<style>
:root { --bg: ${th.bg}; --bg2: ${th.bg2}; --ink: ${th.ink}; --accent: ${th.accent}; --accent2: ${th.accent2}; --on: ${th.onAccent}; --line: ${INK}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #fff4dc; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: ${font}; color: var(--line); background: #fff4dc; }
.clip { position: absolute; inset: 0; }
.manimv { width: 100%; height: 100%; object-fit: cover; }
.shot { overflow: hidden; background: #fff4dc; }
.shot img { width: 100%; height: 100%; object-fit: cover; transform-origin: 50% 50%; }
.ring { position: absolute; left: 50%; top: ${vertical ? 44 : 48}%; width: ${vertical ? 380 : 400}px; height: ${vertical ? 380 : 400}px; margin: -${vertical ? 190 : 200}px 0 0 -${vertical ? 190 : 200}px;
  border-radius: 50%; border: 14px solid var(--accent); box-shadow: 0 0 0 8px rgba(0,0,0,0.35), inset 0 0 0 6px rgba(255,255,255,0.6); }
.flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 4; pointer-events: none; }
.board { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding-bottom: ${vertical ? 420 : 160}px;
  background: repeating-linear-gradient(-45deg, #fff4dc 0 40px, #ffecc4 40px 80px); }
.btext { text-align: center; padding: 0 ${vertical ? 60 : 200}px; font-size: ${vertical ? 132 : 150}px; line-height: 1.05; font-weight: 900; letter-spacing: -0.02em; color: var(--accent);
  -webkit-text-stroke: 8px var(--line); paint-order: stroke fill; }
.bw { display: inline-block; }
.bw:nth-child(2n) { color: var(--accent2); }
.top { position: absolute; left: ${vertical ? 30 : 40}px; top: ${vertical ? 60 : 36}px; right: ${vertical ? 30 : 40}px; display: flex; align-items: center; gap: 22px; z-index: 5; }
.badge { flex: none; width: ${vertical ? 170 : 160}px; height: ${vertical ? 170 : 160}px; border-radius: 50%; background: var(--accent2); color: #fff; border: 8px solid var(--line);
  box-shadow: 0 10px 0 rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 0.9; }
.badge small { font-size: 30px; font-weight: 900; letter-spacing: 0.06em; }
.badge b { font-size: 92px; font-weight: 900; }
.instr span { display: inline-block; padding: 16px 32px; border-radius: 22px; background: var(--accent); color: var(--on); border: 7px solid var(--line);
  font-size: ${vertical ? 58 : 60}px; font-weight: 900; line-height: 1.05; box-shadow: 0 10px 0 rgba(0,0,0,0.3); }
.ja { position: absolute; z-index: 8; ${vertical ? 'left: 380px; top: 1340px;' : 'left: 230px; top: 470px;'} }
.ja span { display: inline-block; padding: 16px 30px; background: #fff; color: var(--line); border: 8px solid var(--line); border-radius: 50% 46% 52% 44%;
  font-size: 70px; font-weight: 900; box-shadow: 0 10px 0 rgba(0,0,0,0.25); }
#capband { position: absolute; left: 0; right: 0; bottom: 0; height: ${vertical ? 900 : 300}px; z-index: 5; pointer-events: none;
  background: linear-gradient(180deg, rgba(10,8,20,0) 0%, rgba(10,8,20,0.55) 45%, rgba(10,8,20,0.82) 100%); }
.cap { display: flex; align-items: center; justify-content: center; z-index: 7; left: ${cap.left}px; top: ${cap.top}px; width: ${cap.w}px; height: ${cap.h}px; right: auto; bottom: auto; }
.who { display: block; width: fit-content; margin: 0 auto 0.3em; padding: 0.1em 0.6em; border-radius: 999px; font-size: 0.5em; letter-spacing: 0.04em; text-transform: uppercase; }
.ct { text-align: center; font-size: ${vertical ? 68 : 66}px; line-height: 1.12; font-weight: 900; letter-spacing: -0.015em; }
.w { display: inline-block; padding: 0 0.1em; border-radius: 0.18em; color: #fff; text-shadow: 0 4px 0 rgba(0,0,0,0.45); }
.w.key { color: var(--accent); }
#ch.host { width: 100%; height: 100%; border-radius: 36px; overflow: hidden; background: #fff4dc; border: 8px solid var(--line); box-shadow: 0 12px 0 rgba(0,0,0,0.3); }
#ch.host img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; display: block; }
#char { position: absolute; left: ${ch.left}px; top: ${ch.top}px; width: ${ch.w}px; height: ${ch.h}px; z-index: 6; filter: drop-shadow(0 10px 18px rgba(0,0,0,0.35)); }
.title { text-align: center; padding: 0 70px; font-size: ${vertical ? 120 : 140}px; line-height: 1.04; font-weight: 900; letter-spacing: -0.03em; color: var(--line); }
.title .tw { display: inline-block; }
.title .tw:nth-child(3n+2) { color: var(--accent2); }
.outro { font-size: ${vertical ? 104 : 120}px; }
#barwrap { position: absolute; left: 0; right: 0; ${vertical ? 'top: 0;' : 'bottom: 0;'} height: 12px; z-index: 9; background: rgba(0,0,0,0.15); }
#bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); transform-origin: left center; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${tl.total}" data-width="${W}" data-height="${H}">
${clipHtml.join('\n')}
${scenes.join('\n')}
<div id="capband"></div>
<div id="char">${host ? `<div id="ch" class="host"><img id="hostimg" src="${esc(host)}" alt=""></div>` : characterSvg(th.accent2)}</div>
<div id="barwrap"><div id="bar"></div></div>
<audio id="mix" src="${esc(input.audio)}" data-start="0" data-duration="${tl.total}" data-volume="1"></audio>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${a.join(';\n')};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`
  return { html: doc, sfx: sfx.filter((s) => s.at >= 0).sort((x, y) => x.at - y.at) }
}
