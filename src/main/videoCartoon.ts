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
  timedWords,
  VOICE_LEAD_S,
  type CharacterPose,
  type Composition,
  type CompositionInput
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
const MOUTH = '200 266'
const EYES = '200 205'

const INK = '#1d1a2b'
const SKIN = '#f4c7a1'
const SKIN_SHADE = '#e3a983'
const HAIR = '#3b2416'
const JEANS = '#34437c'

/** El presentador. `shirt` es el color de la camiseta. */
function characterSvg(shirt: string): string {
  const arm = (side: 'L' | 'R'): string => {
    const x = side === 'L' ? 118 : 282
    return `<g id="arm${side}">
      <rect x="${x - 23}" y="322" width="46" height="132" rx="23" fill="${shirt}" stroke="${INK}" stroke-width="6"/>
      <g id="fore${side}">
        <rect x="${x - 19}" y="430" width="38" height="112" rx="19" fill="${SKIN}" stroke="${INK}" stroke-width="6"/>
        <circle cx="${x}" cy="548" r="29" fill="${SKIN}" stroke="${INK}" stroke-width="6"/>
        ${side === 'R' ? `<g id="thumb" opacity="0"><rect x="${x - 12}" y="552" width="24" height="54" rx="12" fill="${SKIN}" stroke="${INK}" stroke-width="6"/></g>` : ''}
      </g>
    </g>`
  }
  return `<svg viewBox="0 0 400 760" width="100%" height="100%" style="overflow: visible" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="200" cy="742" rx="135" ry="16" fill="rgba(0,0,0,0.22)"/>
  <g id="ch">
    <rect x="142" y="500" width="52" height="218" rx="24" fill="${JEANS}" stroke="${INK}" stroke-width="6"/>
    <rect x="206" y="500" width="52" height="218" rx="24" fill="${JEANS}" stroke="${INK}" stroke-width="6"/>
    <ellipse cx="160" cy="718" rx="50" ry="22" fill="#2a2a33" stroke="${INK}" stroke-width="6"/>
    <ellipse cx="242" cy="718" rx="50" ry="22" fill="#2a2a33" stroke="${INK}" stroke-width="6"/>
    <g id="torso">
      <rect x="106" y="300" width="188" height="236" rx="62" fill="${shirt}" stroke="${INK}" stroke-width="6"/>
      <path d="M170 304 L200 344 L230 304" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <rect x="222" y="372" width="44" height="46" rx="8" fill="rgba(0,0,0,0.12)" stroke="${INK}" stroke-width="5"/>
      <rect x="234" y="340" width="12" height="40" rx="5" fill="#ff4d4d" stroke="${INK}" stroke-width="4"/>
      <rect x="237" y="326" width="6" height="18" rx="2" fill="#c9ced8" stroke="${INK}" stroke-width="3"/>
    </g>
    ${arm('L')}
    ${arm('R')}
    <g id="head">
      <rect x="182" y="282" width="36" height="34" fill="${SKIN_SHADE}" stroke="${INK}" stroke-width="6"/>
      <circle cx="86" cy="212" r="23" fill="${SKIN}" stroke="${INK}" stroke-width="6"/>
      <circle cx="314" cy="212" r="23" fill="${SKIN}" stroke="${INK}" stroke-width="6"/>
      <ellipse cx="200" cy="200" rx="116" ry="110" fill="${SKIN}" stroke="${INK}" stroke-width="6"/>
      <path d="M86 186 C 80 110, 140 72, 206 74 C 270 76, 322 112, 316 186 C 300 150, 280 132, 250 128 C 236 150, 196 150, 170 132 C 150 150, 112 156, 86 186 Z" fill="${HAIR}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <circle cx="132" cy="250" r="17" fill="#ff8b8b" opacity="0.45"/>
      <circle cx="268" cy="250" r="17" fill="#ff8b8b" opacity="0.45"/>
      <g id="eyes">
        <g id="eyesOpen">
          <ellipse cx="160" cy="206" rx="22" ry="25" fill="#fff"/>
          <ellipse cx="240" cy="206" rx="22" ry="25" fill="#fff"/>
          <g id="pupils"><circle cx="162" cy="208" r="11" fill="${INK}"/><circle cx="242" cy="208" r="11" fill="${INK}"/>
          <circle cx="166" cy="203" r="4" fill="#fff"/><circle cx="246" cy="203" r="4" fill="#fff"/></g>
        </g>
        <g id="eyesHappy" opacity="0">
          <path d="M140 214 Q160 188 180 214" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
          <path d="M220 214 Q240 188 260 214" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
        </g>
      </g>
      <g id="glasses" fill="rgba(255,255,255,0.18)" stroke="${INK}" stroke-width="7">
        <circle cx="160" cy="206" r="38"/><circle cx="240" cy="206" r="38"/>
        <path d="M198 204 Q200 196 202 204" fill="none"/>
      </g>
      <g id="brows">
        <path id="browL" d="M128 152 Q160 138 190 150" fill="none" stroke="${HAIR}" stroke-width="11" stroke-linecap="round"/>
        <path id="browR" d="M210 150 Q240 138 272 152" fill="none" stroke="${HAIR}" stroke-width="11" stroke-linecap="round"/>
      </g>
      <path d="M196 226 Q204 244 194 250" fill="none" stroke="${SKIN_SHADE}" stroke-width="6" stroke-linecap="round"/>
      <g id="mouth">
        <ellipse cx="200" cy="266" rx="36" ry="27" fill="#6b1f2a" stroke="${INK}" stroke-width="6"/>
        <ellipse cx="200" cy="282" rx="20" ry="9" fill="#ff7a8a"/>
        <rect x="178" y="241" width="44" height="10" rx="4" fill="#fff"/>
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
  const { script, format, timeline: tl, images } = input
  const vertical = format === 'vertical'
  const W = vertical ? 1080 : 1920
  const H = vertical ? 1920 : 1080
  const th = THEMES[script.theme]
  const light = script.theme === 'papel'
  const font = "'Arial Rounded MT Bold', 'Nunito', 'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif"
  const R = (n: number): number => round(n)
  const r = rng(script.title.length * 104729 + script.scenes.length * 31)
  const a: string[] = []
  const scenes: string[] = []
  const sfx: Composition['sfx'] = []

  // Medidas: personaje a la izquierda (horizontal) o abajo (vertical); tarjeta con la ilustración al lado o arriba.
  const ch = vertical ? { left: 325, top: 1100, w: 430, h: 817 } : { left: 40, top: 230, w: 440, h: 836 }
  const card = vertical ? { left: 50, top: 150, w: 980, h: 820 } : { left: 580, top: 90, w: 1270, h: 730 }
  const cap = vertical ? { left: 60, top: 985, w: 960, h: 140 } : { left: 580, top: 850, w: 1270, h: 190 }

  // ---------- personaje ----------
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
    // En vertical la tarjeta está encima: señala hacia arriba.
    return vertical && name === 'point' ? { ...p, aR: -168, fR: -6, head: -4, lookX: 3, lookY: -8 } : p
  }

  // Respira todo el vídeo y parpadea cada pocos segundos.
  a.push(`tl.fromTo('#torso', {scaleY: 1}, {scaleY: 1.018, transformOrigin: '50% 100%', duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor(tl.total / 1.4))}}, 0)`)
  for (let t = 1.6; t < tl.total - 0.5; t += 2.4 + r() * 2.2) {
    a.push(`tl.fromTo('#eyes', {scaleY: 1}, {scaleY: 0.08, duration: 0.07, ease: 'power1.in', yoyo: true, repeat: 1, immediateRender: false}, ${R(t)})`)
  }

  // Entrada: llega de un salto y saluda.
  a.push(`tl.fromTo('#char', {x: ${vertical ? -500 : -600}, y: 0}, {x: 0, duration: 0.55, ease: 'back.out(1.4)'}, 0.05)`)
  a.push(`tl.fromTo('#char', {y: 0}, {y: -70, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false}, 0.15)`)
  poseTo(pose('wave'), 0.55)
  a.push(`tl.fromTo('#foreR', {rotation: -20}, {rotation: 25, duration: 0.22, ease: 'sine.inOut', yoyo: true, repeat: 5, immediateRender: false}, 0.95)`)
  sfx.push({ at: 0.6, kind: 'pop' })

  // Boca al ritmo de la voz, palabra a palabra y sílaba a sílaba.
  const lip = (narration: string, start: number, voice: number): void => {
    const words = timedWords(narration, start, voice)
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
        a.push(`tl.fromTo('#mouth', {scaleY: 0.22}, {scaleY: ${open}, duration: ${R(Math.max(0.04, d * 0.45))}, ease: 'power1.out', immediateRender: false}, ${R(s)})`)
        a.push(`tl.fromTo('#mouth', {scaleY: ${open}}, {scaleY: 0.22, duration: ${R(Math.max(0.04, d * 0.45))}, ease: 'power1.in', immediateRender: false}, ${R(s + d * 0.5)})`)
      }
    })
  }

  // ---------- portada: cartel con el título ----------
  const titleWords = script.title.split(/\s+/).filter(Boolean)
  scenes.push(`<section id="intro" class="clip" data-start="0" data-duration="${R(tl.intro + 0.3)}">
  <div class="card" id="introcard"><div class="board"><h1 class="title">${titleWords.map((w, i) => `<span class="tw" id="tw${i}">${esc(w)}</span>`).join(' ')}</h1></div></div>
</section>`)
  a.push(`tl.fromTo('#introcard', {scale: 0.2, rotation: -12, opacity: 0}, {scale: 1, rotation: -2, opacity: 1, duration: 0.5, ease: 'back.out(2.2)'}, 0.25)`)
  sfx.push({ at: 0.25, kind: 'whoosh' })
  titleWords.forEach((_, i) => {
    const at = R(0.55 + i * Math.min(0.2, 1.1 / titleWords.length))
    a.push(`tl.fromTo('#tw${i}', {scale: 2.6, opacity: 0}, {scale: 1, opacity: 1, duration: 0.2, ease: 'power4.in'}, ${at})`)
    if (i === titleWords.length - 1) sfx.push({ at: R(at + 0.18), kind: 'impact' })
  })
  a.push(`tl.to('#introcard', {scale: 0.6, rotation: 8, opacity: 0, duration: 0.25, ease: 'power2.in'}, ${R(tl.intro - 0.1)})`)

  // ---------- escenas ----------
  script.scenes.forEach((sc, i) => {
    const t = tl.scenes[i]
    const id = `s${i + 1}`
    const img = images[i]
    const voiceAt = t.start + VOICE_LEAD_S
    const words = timedWords(sc.narration, voiceAt, t.voice)
    const beats = beatsOf(words)
    const tilt = i % 2 ? 1.6 : -1.6
    const art = img
      ? `<div class="pic"><img src="${esc(img)}" alt=""></div>`
      : `<div class="board"><div class="btext">${sc.heading.split(/\s+/).map((w, k) => `<span class="bw" id="${id}bw${k}">${esc(w)}</span>`).join(' ')}</div></div>`
    const badge = sc.step ? `<div class="badge" id="${id}badge"><small>${stepWord(script.lang)}</small><b>${sc.step}</b></div>` : ''
    const joke = sc.joke ? `<div class="ja" id="${id}ja"><span>${esc(laughWord(script.lang))}</span></div>` : ''
    const arrow = (sc.pose ?? 'explain') === 'point'
      ? `<svg class="arrow" id="${id}arrow" viewBox="0 0 200 120"><path d="M10 90 Q 90 10 170 40" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M140 14 L184 44 L134 70" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : ''
    const capHtml = beats
      .map((b, k) => {
        const s = b[0].start
        const e = k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        return `<div class="clip cap" id="${id}c${k}" data-start="${R(s - 0.05)}" data-duration="${R(e - s + 0.05)}"><div class="ct">${b
          .map((w, j) => `<span class="w${w.key ? ' key' : ''}" id="${id}c${k}w${j}">${esc(w.text)}</span>`)
          .join(' ')}</div></div>`
      })
      .join('\n  ')
    scenes.push(`<section id="${id}" class="clip" data-start="${t.start}" data-duration="${t.duration}">
  <div class="card" id="${id}card" style="transform: rotate(${tilt}deg)">${art}${img ? `<div class="head"><span>${esc(sc.heading)}</span></div>` : ''}</div>
  ${badge}${arrow}${joke}
  ${capHtml}
</section>`)

    // La tarjeta entra de un salto y la ilustración se acerca despacio.
    const from = i % 3 === 0 ? `{y: ${H}, rotation: ${tilt * 6}}` : i % 3 === 1 ? `{x: ${W}, rotation: ${tilt * 8}}` : `{scale: 0.1, rotation: ${tilt * 10}}`
    a.push(`tl.fromTo('#${id}card', ${from}, {x: 0, y: 0, scale: 1, rotation: ${tilt}, duration: 0.5, ease: 'back.out(1.6)'}, ${R(t.start)})`)
    a.push(`tl.to('#${id}card', {x: ${i % 2 ? -W : W}, rotation: ${-tilt * 8}, duration: 0.3, ease: 'power3.in'}, ${R(t.start + t.duration - 0.3)})`)
    sfx.push({ at: R(t.start - 0.05), kind: 'whoosh' })
    if (img) a.push(`tl.fromTo('#${id}card .pic img', {scale: 1.04}, {scale: 1.16, duration: ${t.duration}, ease: 'none'}, ${t.start})`)
    else {
      // Sin ilustración: la instrucción, grande, palabra a palabra.
      sc.heading.split(/\s+/).forEach((_, k) => {
        a.push(`tl.fromTo('#${id}bw${k}', {scale: 0, rotation: ${k % 2 ? 10 : -10}}, {scale: 1, rotation: 0, duration: 0.4, ease: 'back.out(2.5)'}, ${R(t.start + 0.35 + k * 0.12)})`)
      })
    }
    if (img) a.push(`tl.fromTo('#${id}card .head', {scale: 0, rotation: -8}, {scale: 1, rotation: -2, duration: 0.45, ease: 'back.out(3)'}, ${R(t.start + 0.35)})`)
    if (sc.step) {
      a.push(`tl.fromTo('#${id}badge', {scale: 0, rotation: -60}, {scale: 1, rotation: -8, duration: 0.5, ease: 'back.out(3)'}, ${R(t.start + 0.25)})`)
      a.push(`tl.to('#${id}badge', {rotation: 6, duration: ${R(Math.max(0.6, t.duration - 1))}, ease: 'sine.inOut'}, ${R(t.start + 0.75)})`)
      sfx.push({ at: R(t.start + 0.27), kind: 'pop' })
    }

    // El personaje: brinco al cambiar, su gesto y gestos pequeños mientras habla.
    a.push(`tl.fromTo('#char', {y: 0}, {y: -34, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false}, ${R(t.start)})`)
    const p = pose(sc.joke ? 'laugh' : sc.pose ?? 'explain')
    poseTo(p, t.start + 0.05)
    if (sc.pose === 'point' && !sc.joke) {
      a.push(`tl.fromTo('#${id}arrow', {scale: 0, opacity: 0}, {scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(3)'}, ${R(t.start + 0.4)})`)
      a.push(`tl.fromTo('#${id}arrow', {x: 0}, {x: 22, duration: 0.35, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor((t.duration - 0.8) / 0.35))}, immediateRender: false}, ${R(t.start + 0.7)})`)
    }
    if (sc.pose === 'surprised' && !sc.joke) {
      a.push(`tl.fromTo('#char', {y: 0}, {y: -90, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false}, ${R(t.start + 0.4)})`)
      sfx.push({ at: R(t.start + 0.4), kind: 'boing' })
    }
    if (sc.joke) {
      a.push(`tl.fromTo('#ch', {rotation: -2}, {rotation: 2, svgOrigin: '200 720', duration: 0.09, ease: 'sine.inOut', yoyo: true, repeat: 15, immediateRender: false}, ${R(t.start + 0.4)})`)
      a.push(`tl.fromTo('#${id}ja', {scale: 0, rotation: -20}, {scale: 1, rotation: 8, duration: 0.4, ease: 'back.out(3)'}, ${R(t.start + 0.45)})`)
      a.push(`tl.to('#${id}ja', {scale: 1.12, duration: 0.25, ease: 'sine.inOut', yoyo: true, repeat: 3}, ${R(t.start + 0.85)})`)
      sfx.push({ at: R(t.start + 0.45), kind: 'boing' })
    }
    if ((sc.pose ?? 'explain') === 'explain' && !sc.joke) {
      a.push(`tl.fromTo('#foreR', {rotation: ${p.fR}}, {rotation: ${p.fR - 22}, duration: 0.45, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor((t.duration - 0.8) / 0.45))}, immediateRender: false}, ${R(t.start + 0.5)})`)
    }
    // La cabeza acompaña cada golpe de voz.
    beats.forEach((b, k) => {
      a.push(`tl.fromTo('#head', {rotation: ${p.head + (k % 2 ? 3 : -3)}}, {rotation: ${p.head}, duration: 0.3, ease: 'power2.out', immediateRender: false}, ${R(b[0].start)})`)
    })
    lip(sc.narration, voiceAt, t.voice)

    // Subtítulos: la palabra que suena, resaltada.
    beats.forEach((b, k) => {
      a.push(`tl.fromTo('#${id}c${k} .ct', {y: 30, scale: 0.9, opacity: 0}, {y: 0, scale: 1, opacity: 1, duration: 0.2, ease: 'back.out(2.5)'}, ${R(b[0].start - 0.05)})`)
      b.forEach((w, j) => {
        const wid = `#${id}c${k}w${j}`
        const next = j + 1 < b.length ? b[j + 1].start : k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        const rest = w.key ? th.accent : light ? INK : '#ffffff'
        a.push(`tl.set('${wid}', {backgroundColor: '${w.key ? th.accent2 : th.accent}', color: '${w.key ? '#ffffff' : th.onAccent}'}, ${R(w.start)})`)
        a.push(`tl.set('${wid}', {backgroundColor: 'rgba(0,0,0,0)', color: '${rest}'}, ${R(Math.max(w.start + 0.12, next - 0.02))})`)
      })
    })
  })

  // ---------- cierre: pulgar arriba ----------
  const outWords = script.outro.split(/\s+/).filter(Boolean)
  scenes.push(`<section id="outro" class="clip" data-start="${tl.outroStart}" data-duration="${tl.outro}">
  <div class="card" id="outcard"><div class="board"><h2 class="title outro">${outWords.map((w, i) => `<span class="tw" id="ow${i}">${esc(w)}</span>`).join(' ')}</h2></div></div>
</section>`)
  a.push(`tl.fromTo('#outcard', {scale: 0.2, rotation: 12, opacity: 0}, {scale: 1, rotation: 2, opacity: 1, duration: 0.5, ease: 'back.out(2.2)'}, ${R(tl.outroStart)})`)
  sfx.push({ at: R(tl.outroStart - 0.05), kind: 'whoosh' })
  outWords.forEach((_, i) => {
    a.push(`tl.fromTo('#ow${i}', {y: 80, opacity: 0}, {y: 0, opacity: 1, duration: 0.3, ease: 'back.out(2.5)'}, ${R(tl.outroStart + 0.3 + i * 0.1)})`)
  })
  poseTo(pose('thumbs'), tl.outroStart + 0.1)
  a.push(`tl.fromTo('#char', {y: 0}, {y: -60, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false}, ${R(tl.outroStart + 0.1)})`)
  sfx.push({ at: R(tl.outroStart + 0.35 + outWords.length * 0.1), kind: 'impact' })
  a.push(`tl.to('#outcard, #char', {opacity: 0, duration: 0.45, ease: 'power2.in'}, ${R(tl.total - 0.5)})`)

  // Fondo: lunares que se desplazan y suelo.
  a.push(`tl.fromTo('#dots', {backgroundPosition: '0px 0px'}, {backgroundPosition: '${Math.round(tl.total * 30)}px ${Math.round(tl.total * 18)}px', duration: ${tl.total}, ease: 'none'}, 0)`)
  a.push(`tl.fromTo('#bar', {scaleX: 0}, {scaleX: 1, duration: ${tl.total}, ease: 'none'}, 0)`)

  const capInk = light ? INK : '#ffffff'
  const doc = `<!doctype html>
<html lang="${esc(script.lang)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="${esc(input.gsap)}"></script>
<style>
:root { --bg: ${th.bg}; --bg2: ${th.bg2}; --ink: ${th.ink}; --accent: ${th.accent}; --accent2: ${th.accent2}; --on: ${th.onAccent}; --line: ${INK}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: ${font}; color: var(--ink);
  background: radial-gradient(120% 90% at 70% 10%, var(--bg2) 0%, var(--bg) 70%); }
.clip { position: absolute; inset: 0; }
#dots { position: absolute; inset: 0; opacity: ${light ? 0.12 : 0.1};
  background-image: radial-gradient(circle, var(--ink) 5px, transparent 6px); background-size: 56px 56px; }
#floor { position: absolute; left: 0; right: 0; bottom: 0; height: ${vertical ? 120 : 110}px; background: rgba(0,0,0,0.16); border-top: 6px solid rgba(0,0,0,0.12); }
#char { position: absolute; left: ${ch.left}px; top: ${ch.top}px; width: ${ch.w}px; height: ${ch.h}px; z-index: 6; }
.card { position: absolute; left: ${card.left}px; top: ${card.top}px; width: ${card.w}px; height: ${card.h}px; border-radius: 42px;
  background: #fffaf0; border: 10px solid var(--line); box-shadow: 0 22px 0 rgba(0,0,0,0.25); overflow: hidden; z-index: 3; }
.pic { position: absolute; inset: 0; }
.pic img { width: 100%; height: 100%; object-fit: cover; transform-origin: 50% 50%; }
.board { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: repeating-linear-gradient(-45deg, #fff4dc 0 34px, #ffecc4 34px 68px); }
.btext { text-align: center; padding: 0 80px; font-size: ${vertical ? 120 : 130}px; line-height: 1.05; font-weight: 900; letter-spacing: -0.02em; color: var(--accent);
  -webkit-text-stroke: 7px var(--line); paint-order: stroke fill; }
.bw { display: inline-block; }
.bw:nth-child(2n) { color: var(--accent2); }
.card .head { position: absolute; left: 0; right: 0; bottom: 34px; display: flex; justify-content: center; transform-origin: 50% 50%; }
.card .head span { display: inline-block; max-width: 88%; text-align: center; padding: 14px 34px; border-radius: 22px; background: var(--accent); color: var(--on);
  border: 7px solid var(--line); font-size: ${vertical ? 56 : 58}px; font-weight: 900; letter-spacing: -0.01em; line-height: 1.05; box-shadow: 0 10px 0 rgba(0,0,0,0.25); }
.badge { position: absolute; left: ${card.left - 34}px; top: ${card.top - 40}px; width: 190px; height: 190px; border-radius: 50%; z-index: 5;
  background: var(--accent2); color: #fff; border: 9px solid var(--line); box-shadow: 0 12px 0 rgba(0,0,0,0.25);
  display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 0.9; }
.badge small { font-size: 34px; font-weight: 900; letter-spacing: 0.06em; }
.badge b { font-size: 104px; font-weight: 900; }
.arrow { position: absolute; z-index: 7; width: 200px; height: 120px; ${vertical ? `left: 760px; top: 1200px; transform-origin: 50% 50%; rotate: -120deg;` : `left: 440px; top: 340px;`} }
.ja { position: absolute; z-index: 8; ${vertical ? 'left: 680px; top: 1130px;' : 'left: 300px; top: 140px;'} }
.ja span { display: inline-block; padding: 18px 34px; background: #fff; color: var(--line); border: 8px solid var(--line); border-radius: 50% 46% 52% 44%;
  font-size: 78px; font-weight: 900; box-shadow: 0 10px 0 rgba(0,0,0,0.25); }
.cap { display: flex; align-items: center; justify-content: center; z-index: 7; left: ${cap.left}px; top: ${cap.top}px; width: ${cap.w}px; height: ${cap.h}px; right: auto; bottom: auto; }
.ct { text-align: center; font-size: ${vertical ? 66 : 70}px; line-height: 1.12; font-weight: 900; letter-spacing: -0.02em; }
.w { display: inline-block; padding: 0 0.1em; border-radius: 0.18em; color: ${capInk}; }
.w.key { color: var(--accent); }
.title { text-align: center; padding: 0 70px; font-size: ${vertical ? 120 : 132}px; line-height: 1.04; font-weight: 900; letter-spacing: -0.03em; color: var(--line); }
.title .tw { display: inline-block; }
.title .tw:nth-child(3n+2) { color: var(--accent2); }
.outro { font-size: ${vertical ? 100 : 110}px; }
#barwrap { position: absolute; left: 0; right: 0; ${vertical ? 'top: 0;' : 'bottom: 0;'} height: 12px; z-index: 9; background: rgba(0,0,0,0.12); }
#bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); transform-origin: left center; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${tl.total}" data-width="${W}" data-height="${H}">
<div id="dots"></div><div id="floor"></div>
${scenes.join('\n')}
<div id="char">${characterSvg(th.accent2)}</div>
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
