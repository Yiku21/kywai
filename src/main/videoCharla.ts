// «Charla y tutorial» del estudio de vídeo (para Reels): dos personajes charlan en una maqueta 3D de juguete, a
// pantalla completa, con un plano por cada cambio de quién habla; arriba, la tarjeta del paso («PASO 2/4», qué hay que
// hacer y los puntos que se marcan uno a uno); en el gancho, las preguntas del público en burbujas de comentario; al
// final, la llamada a comentar una palabra. Subtítulos con el nombre de quien habla. Todo determinista (HyperFrames
// salta de fotograma en fotograma).
import { STAGE_RUNTIME, type StageData } from './charlaStage'
import { beatsOf, esc, round, sceneWords, speakerChip, THEMES, VOICE_LEAD_S, type Composition, type CompositionInput, type TimedWord } from './videoScript'

function stepWord(lang: string): string {
  return lang === 'es' ? 'PASO' : lang === 'pt' ? 'PASSO' : lang === 'fr' ? 'ÉTAPE' : lang === 'it' ? 'PASSO' : lang === 'de' ? 'SCHRITT' : 'STEP'
}

function commentWord(lang: string): string {
  return lang === 'es' ? 'Comenta' : lang === 'pt' ? 'Comente' : lang === 'fr' ? 'Commente' : lang === 'it' ? 'Commenta' : lang === 'de' ? 'Kommentiere' : 'Comment'
}

/**
 * Cuándo cambia el plano dentro de una escena: en los cambios de quién habla (los planos se describen en ese orden) y,
 * si faltan, repartidos por la escena. Nunca dos cambios a menos de 0,8 s.
 */
export function shotCuts(words: TimedWord[], shots: number, start: number, duration: number): number[] {
  if (shots < 2) return []
  const turns: number[] = []
  for (let j = 1; j < words.length; j++) if (words[j].who && words[j].who !== words[j - 1].who) turns.push(words[j].start)
  const cuts = turns.slice(0, shots - 1)
  for (let k = 1; cuts.length < shots - 1 && k < shots; k++) {
    const even = start + (duration * k) / shots
    if (!cuts.some((c) => Math.abs(c - even) < 0.8)) cuts.push(even)
  }
  const out: number[] = []
  for (const c of cuts.sort((x, y) => x - y)) {
    if (c - start < 0.8 || start + duration - c < 0.8) continue
    if (out.length && c - out[out.length - 1] < 0.8) continue
    out.push(round(c))
  }
  return out
}

/** El icono de comentario (bocadillo), en SVG para que salga igual en cualquier equipo. */
const BUBBLE_ICON = (fill: string): string =>
  `<svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="${fill}"/></svg>`

/**
 * Con `stage` (los dos personajes son robots de kywai), el fondo es el plató 3D de charlaStage.ts: los robots se mueven
 * y hablan, la cámara cambia de plano y la imagen de cada escena sale en la pantalla gigante de detrás. Sin él, cada
 * escena son sus imágenes a pantalla completa.
 */
export function buildCharlaComposition(input: CompositionInput, stage?: StageData): Composition {
  const { script, format, timeline: tl } = input
  const shotsOf = stage ? script.scenes.map(() => []) : input.shots ?? input.images.map((x) => [x])
  const backdrop = stage ? '' : '<div class="plain"></div>'
  const vertical = format === 'vertical'
  const W = vertical ? 1080 : 1920
  const H = vertical ? 1920 : 1080
  const th = THEMES[script.theme]
  const font = "'Arial Rounded MT Bold', 'Nunito', 'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif"
  const R = (n: number): number => round(n)
  const a: string[] = []
  const html: string[] = []
  const clipHtml: string[] = []
  const sfx: Composition['sfx'] = []
  const totalSteps = Math.max(0, ...script.scenes.map((s) => s.step ?? 0))
  // Los subtítulos, entre la tarjeta de arriba y los personajes (que van en la mitad de abajo): así no les tapan la
  // cara ni quedan en la zona que cubren los botones de Reels.
  const cap = vertical ? { left: 60, top: 700, w: 960, h: 260 } : { left: 260, top: 820, w: 1400, h: 170 }

  // ---------- portada: el título sobre el primer plano del gancho (la voz empieza enseguida) ----------
  const first = (shotsOf[0] ?? []).find((x): x is string => !!x) ?? null
  const titleWords = script.title.split(/\s+/).filter(Boolean)
  html.push(`<section id="intro" class="clip" data-start="0" data-duration="${R(tl.intro + 0.3)}">
  ${first ? `<div class="shot"><img id="introimg" src="${esc(first)}" alt=""></div>` : backdrop}
  <div class="shade"></div>
  <div class="tbox"><h1 class="title">${titleWords.map((w, i) => `<span class="tw" id="tw${i}">${esc(w)}</span>`).join(' ')}</h1></div>
</section>`)
  if (first) a.push(`tl.fromTo('#introimg', {scale: 1.18}, {scale: 1.06, duration: ${R(tl.intro + 0.3)}, ease: 'power1.out'}, 0)`)
  titleWords.forEach((_, i) => {
    const at = R(0.15 + i * Math.min(0.16, 0.9 / titleWords.length))
    a.push(`tl.fromTo('#tw${i}', {y: 60, scale: 0.6, opacity: 0}, {y: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2.4)'}, ${at})`)
    sfx.push({ at: R(at + 0.05), kind: i === titleWords.length - 1 ? 'impact' : 'pop' })
  })

  // ---------- escenas ----------
  script.scenes.forEach((sc, i) => {
    const t = tl.scenes[i]
    const id = `s${i + 1}`
    const clip = stage ? null : input.clips?.[i] ?? null
    const shots = clip ? [] : (shotsOf[i] ?? []).filter((x): x is string => !!x)
    if (clip) clipHtml.push(`<video id="${id}m" class="clip manimv" src="${esc(clip)}" muted playsinline data-start="${t.start}" data-duration="${t.duration}"></video>`)
    const voiceAt = t.start + VOICE_LEAD_S
    const words = sceneWords(sc, voiceAt, t.voice)
    const beats = beatsOf(words)
    const cuts = shotCuts(words, shots.length, t.start, t.duration)
    const bounds = [t.start, ...cuts, t.start + t.duration]
    const shotHtml = shots.length
      ? shots
          .slice(0, bounds.length - 1)
          .map((src, k) => `<div class="clip shot" id="${id}k${k}" data-start="${R(bounds[k])}" data-duration="${R(bounds[k + 1] - bounds[k] + (k + 2 < bounds.length ? 0.05 : 0))}"><img src="${esc(src)}" alt=""></div>`)
          .join('\n  ')
      : clip
        ? ''
        : backdrop

    // La tarjeta de arriba: el paso con sus puntos, o (en el gancho y el cierre) la idea de la escena.
    const items = sc.step ? sc.items ?? [] : []
    const card = sc.step
      ? `<div class="card" id="${id}card">
    <div class="chead"><span class="pill">${esc(stepWord(script.lang))} ${sc.step}${totalSteps > 1 ? `/${totalSteps}` : ''}</span><span class="ctitle">${esc(sc.heading)}</span></div>
    ${items.length ? `<ul class="items">${items.map((it, k) => `<li id="${id}i${k}"><span class="tick" id="${id}t${k}"><svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="itx">${esc(it)}</span></li>`).join('')}</ul>` : ''}
  </div>`
      : `<div class="tag" id="${id}card"><span>${esc(sc.heading)}</span></div>`
    // El gancho: las preguntas del público, como burbujas de comentario.
    const comments = i === 0 ? sc.comments ?? [] : []
    const bubbles = comments.length
      ? `<div class="bubbles">${comments.map((c, k) => `<div class="bub${k % 2 ? ' alt' : ''}" id="${id}b${k}"><span class="av">${BUBBLE_ICON('#ffffff')}</span><span class="btx">${esc(c)}</span></div>`).join('')}</div>`
      : ''
    const capHtml = beats
      .map((b, k) => {
        const s = b[0].start
        const e = k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        return `<div class="clip cap" id="${id}c${k}" data-start="${R(s - 0.05)}" data-duration="${R(e - s)}"><div class="ct">${speakerChip(script, b[0].who, th)}${b
          .map((w, j) => `<span class="w${w.key ? ' key' : ''}" id="${id}c${k}w${j}">${esc(w.text)}</span>`)
          .join(' ')}</div></div>`
      })
      .join('\n  ')
    html.push(`<section id="${id}" class="clip" data-start="${t.start}" data-duration="${t.duration}">
  ${shotHtml}
  <div class="shade"></div>
  <div class="flash" id="${id}flash"></div>
  ${card}${bubbles}
  ${capHtml}
</section>`)

    // Corte de entrada y cada plano: entra con un golpe pequeño y se acerca despacio (cámara que respira).
    sfx.push({ at: R(t.start - 0.08), kind: 'whoosh' })
    a.push(`tl.fromTo('#${id}flash', {opacity: 0.55}, {opacity: 0, duration: 0.25, ease: 'power2.out'}, ${R(t.start)})`)
    shots.slice(0, bounds.length - 1).forEach((_, k) => {
      const s = bounds[k]
      const len = bounds[k + 1] - s
      const sel = `#${id}k${k} img`
      const fromX = k % 2 ? -18 : 18
      a.push(`tl.fromTo('${sel}', {scale: ${k ? 1.16 : 1.1}, x: ${fromX}}, {scale: 1.03, x: 0, duration: 0.4, ease: 'expo.out'}, ${R(s)})`)
      a.push(`tl.fromTo('${sel}', {scale: 1.03}, {scale: 1.1, duration: ${R(Math.max(0.4, len - 0.4))}, ease: 'none', immediateRender: false}, ${R(s + 0.4)})`)
      if (k) sfx.push({ at: R(s - 0.03), kind: 'pop' })
    })

    // La tarjeta baja desde arriba; los puntos se marcan repartidos mientras hablan.
    a.push(`tl.fromTo('#${id}card', {y: -420, opacity: 0}, {y: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.5)'}, ${R(t.start + 0.12)})`)
    sfx.push({ at: R(t.start + 0.2), kind: 'pop' })
    items.forEach((_, k) => {
      const at = R(voiceAt + ((t.voice * (k + 0.6)) / (items.length + 0.4)))
      a.push(`tl.fromTo('#${id}i${k}', {opacity: 0.38}, {opacity: 1, duration: 0.2, ease: 'power2.out'}, ${at})`)
      a.push(`tl.fromTo('#${id}t${k}', {scale: 0.4, backgroundColor: 'rgba(0,0,0,0.12)'}, {scale: 1, backgroundColor: '${th.accent2}', duration: 0.32, ease: 'back.out(3)'}, ${at})`)
      sfx.push({ at, kind: 'pop' })
    })
    comments.forEach((_, k) => {
      const at = R(t.start + 0.35 + k * 0.6)
      a.push(`tl.fromTo('#${id}b${k}', {scale: 0.3, opacity: 0, y: 40}, {scale: 1, opacity: 1, y: 0, duration: 0.4, ease: 'back.out(2.2)'}, ${at})`)
      sfx.push({ at, kind: 'pop' })
    })
    if (comments.length) {
      // Flotan un poco mientras dura el gancho.
      a.push(`tl.to('#${id} .bubbles', {y: -14, duration: 1.6, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor(t.duration / 1.6))}}, ${R(t.start)})`)
    }

    // Subtítulos: entra cada golpe y se resalta la palabra que suena.
    beats.forEach((b, k) => {
      a.push(`tl.fromTo('#${id}c${k} .ct', {y: 22, opacity: 0}, {y: 0, opacity: 1, duration: 0.18, ease: 'back.out(2.5)'}, ${R(b[0].start - 0.05)})`)
      b.forEach((w, j) => {
        const wid = `#${id}c${k}w${j}`
        const next = j + 1 < b.length ? b[j + 1].start : k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        a.push(`tl.set('${wid}', {backgroundColor: '${w.key ? th.accent2 : th.accent}', color: '${w.key ? '#ffffff' : th.onAccent}'}, ${R(w.start)})`)
        a.push(`tl.set('${wid}', {backgroundColor: 'rgba(0,0,0,0)', color: '${w.key ? th.accent : '#ffffff'}'}, ${R(Math.max(w.start + 0.12, next - 0.02))})`)
      })
    })
  })

  // ---------- cierre: la llamada a comentar ----------
  const last = [...shotsOf].reverse().flat().find((x): x is string => !!x) ?? null
  const outWords = script.outro.split(/\s+/).filter(Boolean)
  const cta = script.cta
  html.push(`<section id="outro" class="clip" data-start="${tl.outroStart}" data-duration="${tl.outro}">
  ${last ? `<div class="shot blur"><img id="outimg" src="${esc(last)}" alt=""></div>` : backdrop}
  <div class="shade dark${stage ? ' soft' : ''}"></div>
  <div class="tbox">
    ${cta ? `<div class="cta" id="cta"><div class="cword"><span class="cicon">${BUBBLE_ICON(th.onAccent)}</span>${esc(commentWord(script.lang))} <b id="ctaw">${esc(cta.word)}</b></div>${cta.line ? `<div class="cline">${esc(cta.line)}</div>` : ''}</div>` : ''}
    <h2 class="title outro">${outWords.map((w, i) => `<span class="tw" id="ow${i}">${esc(w)}</span>`).join(' ')}</h2>
  </div>
  <div class="flash" id="outflash"></div>
</section>`)
  a.push(`tl.fromTo('#outflash', {opacity: 0.7}, {opacity: 0, duration: 0.3, ease: 'power2.out'}, ${R(tl.outroStart)})`)
  sfx.push({ at: R(tl.outroStart - 0.08), kind: 'whoosh' })
  if (last) a.push(`tl.fromTo('#outimg', {scale: 1.1}, {scale: 1.2, duration: ${tl.outro}, ease: 'none'}, ${R(tl.outroStart)})`)
  if (cta) {
    a.push(`tl.fromTo('#cta', {scale: 0.4, opacity: 0, rotation: -6}, {scale: 1, opacity: 1, rotation: 0, duration: 0.45, ease: 'back.out(2.2)'}, ${R(tl.outroStart + 0.15)})`)
    a.push(`tl.fromTo('#ctaw', {scale: 1}, {scale: 1.12, duration: 0.35, ease: 'sine.inOut', yoyo: true, repeat: ${Math.max(1, Math.floor((tl.outro - 1) / 0.35))}, immediateRender: false}, ${R(tl.outroStart + 0.6)})`)
    sfx.push({ at: R(tl.outroStart + 0.3), kind: 'impact' })
  }
  outWords.forEach((_, i) => {
    a.push(`tl.fromTo('#ow${i}', {y: 60, opacity: 0}, {y: 0, opacity: 1, duration: 0.3, ease: 'back.out(2.5)'}, ${R(tl.outroStart + (cta ? 0.55 : 0.2) + i * 0.08)})`)
  })
  a.push(`tl.to('#outro .tbox', {opacity: 0, duration: 0.45, ease: 'power2.in'}, ${R(tl.total - 0.5)})`)
  a.push(`tl.fromTo('#bar', {scaleX: 0}, {scaleX: 1, duration: ${tl.total}, ease: 'none'}, 0)`)

  const doc = `<!doctype html>
<html lang="${esc(script.lang)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="${esc(input.gsap)}"></script>
<style>
:root { --bg: ${th.bg}; --bg2: ${th.bg2}; --ink: #1d1a2b; --accent: ${th.accent}; --accent2: ${th.accent2}; --on: ${th.onAccent}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #1b1626; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: ${font}; color: var(--ink); background: #1b1626; }
.clip { position: absolute; inset: 0; }
.manimv { width: 100%; height: 100%; object-fit: cover; }
.shot { position: absolute; inset: 0; overflow: hidden; background: #1b1626; }
.shot img { width: 100%; height: 100%; object-fit: cover; transform-origin: 50% 62%; }
.shot.blur img { filter: blur(14px) brightness(0.8); }
.plain { position: absolute; inset: 0; background: radial-gradient(120% 80% at 50% 40%, var(--bg2), var(--bg)); }
.shade { position: absolute; inset: 0; pointer-events: none; z-index: 2;
  background: linear-gradient(180deg, rgba(10,8,20,0.42) 0%, rgba(10,8,20,0) 26%, rgba(10,8,20,0) 52%, rgba(10,8,20,0.5) 72%, rgba(10,8,20,0.7) 100%); }
.shade.dark { background: rgba(10,8,20,0.55); }
.shade.dark.soft { background: rgba(10,8,20,0.32); }
#stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.stageimg { display: none; }
.flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 4; pointer-events: none; }
.card { position: absolute; z-index: 5; left: ${vertical ? 50 : 60}px; right: ${vertical ? '50px' : 'auto'}; ${vertical ? '' : 'width: 820px;'} top: ${vertical ? 130 : 50}px;
  background: rgba(255,251,243,0.96); border-radius: 40px; padding: 30px 38px 32px; box-shadow: 0 18px 50px rgba(0,0,0,0.35), 0 0 0 6px rgba(255,255,255,0.35); }
.chead { display: flex; flex-direction: column; gap: 14px; }
.pill { align-self: flex-start; padding: 8px 24px; border-radius: 999px; background: var(--accent2); color: #fff; font-size: 38px; font-weight: 900; letter-spacing: 0.08em; }
.ctitle { font-size: ${vertical ? 74 : 58}px; line-height: 1.04; font-weight: 900; letter-spacing: -0.02em; color: var(--ink); }
.items { list-style: none; margin-top: 20px; display: flex; flex-direction: column; gap: 14px; }
.items li { display: flex; align-items: center; gap: 18px; font-size: ${vertical ? 50 : 40}px; font-weight: 800; line-height: 1.1; color: #2d2840; opacity: 0.38; }
.tick { flex: none; width: 52px; height: 52px; border-radius: 50%; padding: 7px; background: rgba(0,0,0,0.12); }
.tag { position: absolute; z-index: 5; left: 0; right: 0; top: ${vertical ? 150 : 60}px; text-align: center; }
.tag span { display: inline-block; padding: 18px 40px; border-radius: 30px; background: var(--accent); color: var(--on); font-size: ${vertical ? 64 : 58}px; font-weight: 900; line-height: 1.05;
  box-shadow: 0 14px 40px rgba(0,0,0,0.35); max-width: ${vertical ? 940 : 1500}px; }
.bubbles { position: absolute; z-index: 6; left: ${vertical ? 60 : 80}px; right: ${vertical ? '60px' : 'auto'}; top: ${vertical ? 330 : 220}px; display: flex; flex-direction: column; gap: 22px; }
.bub { align-self: flex-start; display: flex; align-items: center; gap: 18px; max-width: ${vertical ? 860 : 900}px; padding: 20px 30px 20px 20px; border-radius: 34px 34px 34px 8px;
  background: #fff; box-shadow: 0 12px 34px rgba(0,0,0,0.3); font-size: ${vertical ? 44 : 40}px; font-weight: 800; line-height: 1.12; color: #2d2840; }
.bub.alt { align-self: flex-end; border-radius: 34px 34px 8px 34px; }
.av { flex: none; width: 66px; height: 66px; border-radius: 50%; background: var(--accent2); display: flex; align-items: center; justify-content: center; font-size: 34px; }
.cap { display: flex; align-items: center; justify-content: center; z-index: 7; left: ${cap.left}px; top: ${cap.top}px; width: ${cap.w}px; height: ${cap.h}px; right: auto; bottom: auto; }
.who { display: block; width: fit-content; margin: 0 auto 0.3em; padding: 0.1em 0.6em; border-radius: 999px; font-size: 0.5em; letter-spacing: 0.04em; text-transform: uppercase; }
.ct { text-align: center; font-size: ${vertical ? 66 : 62}px; line-height: 1.12; font-weight: 900; letter-spacing: -0.015em; padding: 18px 28px 22px; border-radius: 34px;
  background: rgba(16,11,28,0.62); box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
.w { display: inline-block; padding: 0 0.1em; border-radius: 0.18em; color: #fff; text-shadow: 0 4px 0 rgba(0,0,0,0.5), 0 0 24px rgba(0,0,0,0.45); }
.w.key { color: var(--accent); }
.tbox { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 46px; padding: 0 60px; }
.title { text-align: center; font-size: ${vertical ? 112 : 128}px; line-height: 1.04; font-weight: 900; letter-spacing: -0.03em; color: #fff; text-shadow: 0 8px 0 rgba(0,0,0,0.35), 0 0 40px rgba(0,0,0,0.5); }
.title .tw { display: inline-block; }
.title .tw:nth-child(3n+2) { color: var(--accent); }
.outro { font-size: ${vertical ? 84 : 96}px; }
.cta { display: flex; flex-direction: column; align-items: center; gap: 18px; }
.cword { display: flex; align-items: center; gap: 22px; padding: 26px 44px; border-radius: 44px; background: var(--accent); color: var(--on); font-size: ${vertical ? 76 : 80}px; font-weight: 900;
  box-shadow: 0 18px 50px rgba(0,0,0,0.45); }
.cword b { display: inline-block; padding: 4px 22px; border-radius: 22px; background: #fff; color: var(--ink); letter-spacing: 0.02em; }
.cicon { font-size: 70px; display: flex; }
.cline { font-size: ${vertical ? 46 : 44}px; font-weight: 800; color: #fff; text-align: center; text-shadow: 0 4px 0 rgba(0,0,0,0.4); }
#barwrap { position: absolute; left: 0; right: 0; top: 0; height: 10px; z-index: 9; background: rgba(0,0,0,0.2); }
#bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); transform-origin: left center; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${tl.total}" data-width="${W}" data-height="${H}">
${stage ? `<canvas id="stage" width="${W}" height="${H}"></canvas>\n${script.scenes.map((_, i) => (input.images[i] ? `<img class="stageimg" src="${esc(input.images[i]!)}" alt="">` : '<img class="stageimg" alt="">')).join('')}` : ''}
${clipHtml.join('\n')}
${html.join('\n')}
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
${stage ? `<script>window.__stage = ${JSON.stringify(stage).replace(/</g, '\\u003c')};</script>\n<script type="module">${STAGE_RUNTIME}</script>` : ''}
</body>
</html>
`
  return { html: doc, sfx: sfx.filter((s) => s.at >= 0).sort((x, y) => x.at - y.at) }
}
