// Estilos de película (src/shared/filmStyles.ts): dónde vive cada biblioteca, el encargo para el agente que dirige
// la película y cómo se encuentra el MP4 que deja. La instalación está en videoStudio.ts (installVideoStudio).
//  - Lemo-Opuscar (MIT): 66 estilos, cada uno con su guía (styles/<slug>/STYLE.md) y herramientas de render.
//  - Claude Animation Base (MIT): animación pintada con p5.js + p5.brush. Su personaje es la mascota de Anthropic,
//    así que kywai le añade sus propios robots (KYWAI_ROBOTS_JS) y una guía (KYWAI_KIT_GUIDE) para usarlos.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FILM_STYLES, KYWAI_FILM, type FilmStyle } from '../shared/filmStyles'
import { defaultVoiceFor, MAC_VOICES, parseVoiceId, type VideoKind } from '../shared/videoChoice'
import { voiceboxUrl } from './voicebox'
import type { CharacterForVideo } from './videoCharacters'
import { dialogueRules, HOOK_RULE } from './videoScript'
import { chatterboxDir, chatterboxPython, chatterboxReady, CHATTERBOX_EMOTION } from './chatterbox'
import { VOICE_EMOTIONS } from '../shared/voiceEmotion'
import { episodeRules, type EpisodeBrief } from './series'

export const LEMO_OPUSCAR_REPO = 'https://github.com/lemomo-ai/lemo-opuscar.git'
/** Versión fija: lo que se probó con kywai (10 nov 2026). Se sube a mano tras probar una nueva. */
export const LEMO_OPUSCAR_COMMIT = '143f387ad774525dc9abc0ff05fb5f4bfbaa5f02'
export const ANIMATION_BASE_REPO = 'https://github.com/JohnHeibel/ClaudeAnimationBase.git'
export const ANIMATION_BASE_COMMIT = '0ac8bf2b31942376cb6b8c4074715595d512acd2'

/** Lo que se deja fuera al descargar Lemo-Opuscar: las películas de ejemplo y las imágenes grandes (como su propia skill). */
export const LEMO_SPARSE = ['/*', '!/styles/*/demo/', '!/styleboard/', '!/docs/frames/', '!/docs/cover.jpg', '!/docs/opuscar98.jpg', '!/styles/*/poster.jpg']

export function filmPaths(studioDir: string): { lib: string; kit: string } {
  return { lib: join(studioDir, 'lemo-opuscar'), kit: join(studioDir, 'animacion-pintada') }
}

/** La biblioteca descargada y con sus paquetes (su instalador deja node_modules/.lemo-ok al terminar). */
export function lemoReady(lib: string): boolean {
  return existsSync(join(lib, 'AGENTS.md')) && existsSync(join(lib, 'core', 'render')) && existsSync(join(lib, 'node_modules', '.lemo-ok'))
}

export function kitReady(kit: string): boolean {
  return existsSync(join(kit, 'ANIMATION_GUIDE.md')) && existsSync(join(kit, 'src', 'kywai-robots.js')) && existsSync(join(kit, 'node_modules'))
}

/** ¿Está lo que necesita este estilo? */
export function filmReady(studioDir: string, slug: string): boolean {
  const p = filmPaths(studioDir)
  return slug === KYWAI_FILM ? kitReady(p.kit) : lemoReady(p.lib)
}

export interface FilmPromptInput {
  style: FilmStyle
  topic: string
  source?: string
  format: 'horizontal' | 'vertical'
  lang: string
  studioDir: string
  /** Carpeta de la película (absoluta): es donde trabaja el agente. */
  work: string
  /** Adjuntos del usuario («- ruta (adjunto del usuario: nombre)»). */
  files?: string[]
  /** Episodio de una serie («/serie»). */
  episode?: EpisodeBrief
  /** Tipo elegido en el selector: cómo se cuenta (sin él, lo decide el agente). */
  kind?: VideoKind
  /** Personaje elegido en el selector: se dibuja en el estilo de la película. */
  character?: CharacterForVideo
  /** Voz elegida en el selector («gemini-puck», «kokoro-ef_dora», «voicebox-<perfil>», «sistema»). */
  voice?: string
  /** Diálogo entre dos personajes, cada uno con su voz. */
  dialogue?: boolean
}

/**
 * La voz con vida en una película: cada frase con su emoción. Con Chatterbox instalado, el agente lo usa (con una
 * muestra de la voz elegida, para que copie su timbre); nunca se retoca la velocidad ni el tono (suena robótico).
 */
function emotionVoiceRules(studio: string): string[] {
  const rules = [
    `- Voz con vida: escribe cada frase con su emoción (${VOICE_EMOTIONS.join(', ')}) y genera la voz frase a frase, con pausas cortas entre frases según la emoción (más largas tras una triste). Varíala como lo haría una persona: el gancho con fuerza, los problemas tristes o firmes, las soluciones alegres o emocionadas. NUNCA cambies la velocidad ni el tono del audio (atempo, rate, pitch): suena robótico.`
  ]
  if (chatterboxReady(studio))
    rules.push(
      `- Para que la voz actúe, usa Chatterbox (ya instalado): genera primero una muestra de 12 a 20 s de la voz elegida leyendo un texto tranquilo (WAV), y después escribe un JSON {"lang": "<código del idioma>", "lines": [{"text": "…", "out": "<ruta .wav>", "ref": "<la muestra>", "exaggeration": …, "cfg": …}]} y lánzalo con HF_HOME=${join(chatterboxDir(studio), 'modelos')} "${chatterboxPython(studio)}" "${join(chatterboxDir(studio), 'voz.py')}" encargo.json (escribe «ok N» por frase; todas en un solo encargo, que el modelo tarda en cargar). Valores por emoción: ${Object.entries(CHATTERBOX_EMOTION).map(([e, v]) => `${e} ${v.exaggeration}/${v.cfg}`).join(', ')}. Si falla, la voz elegida como siempre.`
    )
  return rules
}

/** La voz elegida, para el encargo de una película: con qué herramienta se hace. */
function voiceRule(voice: string | undefined, lib: string): string[] {
  const v = parseVoiceId(voice)
  if (!v) return []
  if (v.engine === 'edge')
    return [`- Voz elegida por el usuario: la voz neuronal de Microsoft Edge «${v.id}» con edge-tts (la de ${join(lib, 'core', 'tts')} con --voice ${v.id}, o «pip install edge-tts» y «edge-tts --voice ${v.id} --text "texto" --write-media voz.mp3»; necesita internet). No la cambies; si no hay internet, usa Kokoro y dilo al terminar.`]
  if (v.engine === 'mac') {
    const m = MAC_VOICES.find((x) => x.key === v.id)!
    return [`- Voz elegida por el usuario: ${m.name}, la voz de Siri de macOS (identificador ${m.identifier}, ${m.lang}). «say» no la usa: genera el audio con AVSpeechSynthesizer (un script de Swift con AVSpeechSynthesizer.write que guarde los búferes en un archivo). Si no está descargada en el equipo, usa la de Edge es-MX-JorgeNeural y dilo al terminar.`]
  }
  if (v.engine === 'kokoro') return [`- Voz elegida por el usuario: Kokoro, voz «${v.id}» (la de ${join(lib, 'core', 'tts')} con esa voz, o «npx hyperframes tts "texto" -v ${v.id}»). No la cambies.`]
  if (v.engine === 'gemini')
    return [`- Voz elegida por el usuario: la voz «${v.id}» de Gemini TTS (modelo gemini-2.5-flash-preview-tts, prebuiltVoiceConfig.voiceName "${v.id}", con la clave de la variable GEMINI_API_KEY o de ~/.gemini/.env). Si no hay clave o falla, usa Kokoro y dilo al terminar.`]
  if (v.engine === 'voicebox')
    return [`- Voz elegida por el usuario: Voicebox (abierto en este equipo), perfil «${v.id}»: POST ${voiceboxUrl()}/v1/audio/speech con {"model": "tts-1", "input": texto, "voice": "${v.id}", "response_format": "wav"}. Si no responde, usa Kokoro y dilo al terminar.`]
  return ['- Voz elegida por el usuario: la del sistema operativo (say en macOS, espeak-ng en Linux, la de Windows).']
}

/** Cómo se cuenta la película según el tipo elegido. */
const KIND_RULES: Record<VideoKind, string> = {
  rapido: '- Tipo «rápido: texto animado»: la película se cuenta con frases cortas en pantalla, grandes y animadas al ritmo de la voz, sobre fondos y escenas del estilo; nada de presentador a cámara. Que el texto respire: pocas palabras a la vez y movimientos suaves.',
  presentador: '- Tipo «dibujo con presentador»: un presentador dibujado en el estilo (el personaje elegido, si lo hay) lo explica hablando a cámara, con ilustraciones o escenas de lo que cuenta alrededor o a pantalla completa. Si la guía del estilo pide «sin texto», el presentador lo cuenta con la voz y actuando.',
  mixto: '- Tipo «mixto»: alterna escenas con el presentador dibujado (el personaje elegido, si lo hay) explicándolo a cámara y golpes de texto grande en pantalla, más o menos uno de cada tres, sin dos golpes de texto seguidos.'
}

/** El personaje elegido, para el encargo: quién es, cómo es y dónde están sus imágenes. */
function characterRules(c: CharacterForVideo, kitRobots: boolean): string[] {
  if (c.builtin && kitRobots) return []
  return [
    `- Protagonista elegido por el usuario: ${c.name}. Sale en la mayoría de los planos y siempre igual (misma cara, cuerpo, ropa y colores), dibujado en el estilo de esta película: se adapta al estilo, pero se le reconoce.`,
    ...(c.look ? [`- Cómo es (en inglés, sin el estilo de dibujo): ${c.look}`] : []),
    ...(c.about ? [`- Lo que cuenta el usuario de él: «${c.about}»`] : []),
    ...(c.images.length ? [`- Sus imágenes de referencia (ábrelas y míralas antes de diseñarlo): ${c.images.join(', ')}`] : []),
    '- Antes de animar, haz una hoja de personaje en el estilo (de frente, de lado y dos expresiones) y compárala con las referencias.'
  ]
}

/** La guía de un estilo propio de kywai, que kywai deja en la carpeta de la película (kywaiFilmGuides.ts). */
export const KYWAI_GUIDE_FILE = 'ESTILO-kywai.md'

/** Estilos que se hacen en 3D (three.js u otro motor 3D): llevan la lista de «escena viva» (ALIVE_3D). */
export const FILM_3D = new Set([
  'lowpoly-island',
  'glass-product',
  'tilt-shift',
  'brick-toy',
  'memphis-diorama',
  'desktop-flythrough',
  'white-model',
  'lidar-survey',
  'teardown',
  'data-physical',
  'hd-2d',
  'iso-infographic',
  'kywai-crystal-3d',
  'kywai-deep-time'
])

/**
 * Lo que separa una escena 3D viva de una muerta (movimiento y luz), como lista de control. Se revisa en las tiras de
 * fotogramas antes de entregar; la guía del estilo manda si dice otra cosa.
 */
export const ALIVE_3D = [
  '- Escena 3D viva (repásalo en cada plano antes de renderizar; si la guía del estilo dice otra cosa, manda la guía):',
  '  · Bucles que nunca paran: humo, nieve, polvo, agua, nubes o partículas siempre en marcha, también cuando la historia se para.',
  '  · Desfase: nada se mueve a la vez; cada árbol, luz o personaje con su propio reloj (fase y velocidad distintas).',
  '  · Arcos: lo que salta o cae va en arco, se estira al subir y se aplasta un poco al caer; nada en línea recta ni a velocidad fija.',
  '  · Luz viva: el fuego parpadea, los farolillos se balancean, las pantallas laten; la luz cambia un poco aunque nada más lo haga.',
  '  · Cámara que respira: una deriva lenta y continua (un poco de giro o de avance); nunca del todo quieta.',
  '  · Luz principal fuerte y de lado, con sombras de verdad (no luz plana igual en todas las caras); relleno frío que suaviza las sombras y un borde de luz que recorta los contornos.',
  '  · Atmósfera: brillo en las luces cálidas, niebla o bruma detrás para dar profundidad.',
  '  · Nada de dibujo plano: cada cosa es un modelo con volumen y material (brillo, rugosidad, textura), nunca un cuadrado o un círculo de color liso que hace de marcador de posición. kywai lo comprueba en el MP4 y, si parece plano, te la devuelve.'
]

/**
 * Lo que separa una acción viva de una plana (los principios de animación), con lo que se suele hacer mal y cómo se
 * arregla. Va en todas las películas; la guía del estilo manda si pide otra cosa (animación limitada, sin movimiento…).
 */
export const ALIVE_ACTION = [
  '- Acción viva (cuando algo o alguien se mueve; repásalo en las capturas de cada beat; si la guía del estilo dice otra cosa, manda la guía):',
  '  · Anticipación: antes de cada acción, un gesto contrario y corto (se agacha antes de saltar, echa el brazo atrás antes de lanzar).',
  '  · Pausa en el impacto: al golpear o chocar, 3–5 fotogramas quietos y luego la reacción, con un leve temblor de cámara.',
  '  · Solapamiento: pelo, ropa, colas y llamas siguen moviéndose un poco después de que el cuerpo para.',
  '  · Aplastar y estirar al saltar, caer o chocar, conservando el volumen.',
  '  · Puesta en escena clara: una sola acción importante a la vez y la mirada del espectador llevada hacia ella.',
  '  Evita → haz:',
  '  · Trayectorias rectas → arcos con gravedad (sube despacio, cae más rápido).',
  '  · Velocidad constante (tween lineal) → curvas de suavizado (sale y llega despacio, pasa rápido).',
  '  · Estela o cola que aparece antes que el objeto → la estela nace de la trayectoria ya recorrida.',
  '  · Fundido al golpear → fotogramas de impacto (destello, forma de estrella o líneas de choque de 1–3 fotogramas).',
  '  · Movimientos rápidos que saltan de una pose a otra → un fotograma de barrido (smear) o desenfoque de movimiento entre las dos.',
  '  · Personajes quietos como estatuas mientras otro habla → respiración, parpadeos y miradas.'
]

/** La hoja de beats que el agente escribe antes de animar y que luego lee quien revisa la película. */
export const BEATS_FILE = 'beats.md'

/** El nombre del archivo final que se pide al agente (y el primero que se busca al terminar). */
export const FILM_FILE = 'pelicula.mp4'

const LANG_NAMES: Record<string, string> = { es: 'español', en: 'inglés', fr: 'francés', it: 'italiano', pt: 'portugués', de: 'alemán', ja: 'japonés', zh: 'chino' }

/**
 * El encargo de una película con estilo: el agente lee la guía del estilo, decide la historia, pone voz y música,
 * renderiza y deja el MP4. Sin preguntas a mitad: la petición es todo el brief (kywai trabaja mientras no estás).
 */
export function filmPrompt(input: FilmPromptInput): string {
  const { style, work } = input
  const { lib, kit } = filmPaths(input.studioDir)
  const size = input.format === 'vertical' ? 'vertical 1080×1920' : 'horizontal 1920×1080'
  const lang = LANG_NAMES[input.lang] ?? input.lang
  const topic = input.topic || 'el texto de abajo'
  const common = [
    `- La carpeta de la película es ${work} (ya existe y es tu carpeta de trabajo): todo lo que hagas va ahí.`,
    '- No preguntes nada: este mensaje es el brief completo. Lo que no diga, decídelo tú con criterio y sigue; nada de guion gráfico para aprobar.',
    `- Idioma de la voz y los subtítulos: ${lang}. Formato ${size}, salvo que la guía del estilo fije otro. Duración: de 30 a 60 segundos, salvo que el tema pida otra cosa.`,
    `- ${HOOK_RULE}`,
    `- El vídeo final se llama exactamente ${join(work, FILM_FILE)} (con sonido). Deja también poster.jpg y, si hay voz, el .srt.`,
    `- Antes de animar, escribe ${join(work, BEATS_FILE)}: el concepto en una frase, los fotogramas por segundo y una lista de beats con su tramo de fotogramas y lo que pasa en él (p. ej. «0–22 flota y mira · 22–44 carga, la bola crece · 44–48 latigazo con barrido · 64 impacto, 5 fotogramas quietos»), más las reglas que aplicas y lo que evitas. Anima siguiéndola; si la historia cambia, actualízala. Otro agente revisará la película contra ella.`,
    '- Revisa tu trabajo antes de entregar: una captura por beat comparada con beats.md y con las reglas de abajo, tiras de fotogramas de las acciones rápidas y una pasada completa; arregla lo que veas. Después kywai comprueba el MP4 (pantallas negras, imagen congelada, silencios) y otro agente lo revisa.',
    `- Efectos de sonido reales: en ${join(input.studioDir, 'efectos')} hay WAV listos (${join(input.studioDir, 'efectos', 'fuentes.json')} dice qué es cada uno) y, si existe, «${join(input.studioDir, '.venv', process.platform === 'win32' ? 'Scripts\\earshot.exe' : 'bin/earshot')} sfx list» y «… sfx render <id> -o x.wav [--dur s] [--apex s]» dan 252 más (MIT, sin red). Úsalos antes que sintetizar los tuyos y ponlos en el fotograma exacto de la acción.`,
    '- Nada de personajes, marcas, logotipos ni obras de terceros; solo lo que el usuario haya dado. Ningún crédito ni firma de la biblioteca en la película.',
    '- No dejes procesos en segundo plano al terminar ni cierres procesos que no hayas lanzado tú.',
    '- Al terminar, responde solo con dos líneas: «Título: …» y una frase sobre de qué va la película. Si no puedes hacerla, empieza tu respuesta con «BLOQUEADA:» y el motivo en una frase.'
  ]
  // En el estilo pintado a mano, los robots salen con su propio dibujo del kit; con otro personaje (o ninguno), se
  // dibuja con el kit desde cero.
  const kitRobots = !input.character || !!input.character.builtin
  const head =
    style.slug === KYWAI_FILM
      ? [
          `Dirige y produce una película corta de animación pintada a mano sobre: ${topic}`,
          '',
          `${input.character ? (kitRobots ? 'Los protagonistas son los robots de kywai (Hermes, Claude y Codex)' : `El protagonista es ${input.character.name} (más abajo, cómo es)`) : 'Sin protagonista fijo: inventa los personajes que pida la historia'}. Se hace con el kit de animación de ${kit}:`,
          `- Lee primero ${join(kit, 'ANIMATION_GUIDE.md')} y ${join(kit, 'KYWAI.md')}, y síguelos (storyboard, construir plano a plano, revisar con hojas de contacto, renderizar).`,
          `- Copia el kit a la carpeta de la película sin node_modules ni out (en su lugar, un enlace a ${join(kit, 'node_modules')}) y trabaja en esa copia. No cambies ${kit}.`,
          input.character && kitRobots
            ? '- El personaje de ejemplo del kit (Clawd) no sale nunca: usa kywaiRobot() de src/kywai-robots.js.'
            : '- El personaje de ejemplo del kit (Clawd) no sale nunca: dibuja los personajes con las mismas técnicas del kit (formas, pincel, emotes).',
          '- La guía pide «sin texto»: la historia se cuenta actuando. Pon voz solo si el tema necesita explicarse; música y efectos, siempre.',
          `- Para la voz y la música puedes usar las herramientas de ${lib} si están (core/tts, core/audio y core/render/mux.sh; mira su core/README.md).`
        ]
      : style.base
        ? [
            `Dirige y produce una película corta hecha solo con código, en el estilo «${style.en}» (${style.name}), un estilo propio de kywai, sobre: ${topic}`,
            '',
            `Se hace con las herramientas de la biblioteca Lemo-Opuscar, que está en ${lib} (en sus guías, LIB), como un estilo propio del usuario (${join(lib, 'MY-STYLES.md')}), ya aprobado:`,
            `- La guía del estilo es ${join(work, KYWAI_GUIDE_FILE)} (la dejó kywai en la carpeta de la película). Léela entera: el estilo es fijo, la historia es tuya.`,
            `- Lee también ${join(lib, 'AGENTS.md')}, ${join(lib, 'DIRECTOR.md')}, ${join(lib, 'TECHNIQUE.md')} y ${join(lib, 'core', 'README.md')}, y síguelos como con cualquier estilo.`,
            `- El motor sale del estilo de la biblioteca «${style.base}»: «sh ${join(lib, 'plugin', 'skills', 'lemo-opuscar', 'scripts', 'setup.sh')} demo ${style.base}» (con LEMO_OPUSCAR_HOME=${lib}) baja su código, y ${join(lib, 'styles', style.base, 'STYLE.md')} lo explica. Copia a la carpeta de la película lo que uses; donde las dos guías no coincidan, manda la de kywai. Su historia no se repite.`,
            `- Donde las guías digan films/<nombre>/, es la carpeta de la película. Las herramientas se lanzan desde la biblioteca con la ruta absoluta de la película (cd "${lib}" && node core/render/still.mjs "${work}" 1.5 3).`,
            '- Ni styles/ ni core/ se tocan, ni se guarda nada en ~/lemo-my-styles.'
          ]
        : [
          `Dirige y produce una película corta hecha solo con código, en el estilo «${style.en}» (${style.name}) de la biblioteca Lemo-Opuscar, sobre: ${topic}`,
          '',
          `La biblioteca está en ${lib} (en sus guías, LIB). Trabajas como en su modo «skill» (${join(lib, 'plugin', 'skills', 'lemo-opuscar', 'SKILL.md')}):`,
          `- Lee antes de empezar ${join(lib, 'AGENTS.md')}, ${join(lib, 'DIRECTOR.md')}, ${join(lib, 'TECHNIQUE.md')}, ${join(lib, 'core', 'README.md')} y la guía del estilo, ${join(lib, 'styles', style.slug, 'STYLE.md')}. Síguelos: el estilo es fijo, la historia es tuya.`,
          `- Donde las guías digan films/<nombre>/, es la carpeta de la película. Las herramientas se lanzan desde la biblioteca con la ruta absoluta de la película (cd "${lib}" && node core/render/still.mjs "${work}" 1.5 3).`,
          `- Los paquetes ya están instalados. Si falta alguno, «sh ${join(lib, 'plugin', 'skills', 'lemo-opuscar', 'scripts', 'setup.sh')} deps voice» lo pone (con LEMO_OPUSCAR_HOME=${lib}). Los que pida solo este estilo, instálalos en la carpeta de la película.`,
          '- Ni styles/ ni core/ se tocan: copia a la carpeta de la película lo que necesites.',
          ...(style.needs === 'material'
            ? ['- Este estilo se monta con material real (imágenes, datos, archivo o escaneos). Usa el que dé el usuario; si no hay, busca material libre (dominio público o licencia abierta) con las herramientas que nombra la guía del estilo, y apunta cada fuente y su licencia en CREDITS.']
            : [])
        ]
  const extra = [
    ...(input.kind ? [KIND_RULES[input.kind]] : []),
    ...voiceRule(input.voice ?? defaultVoiceFor(input.lang) ?? undefined, lib),
    ...emotionVoiceRules(input.studioDir),
    ...(input.dialogue ? [...dialogueRules(input.character ? { name: input.character.name } : undefined).filter((r) => !r.includes('"speakers"') && !r.includes('"narration"')), '- Cada personaje con su voz (otra del mismo idioma, de su género) y su emoción en cada frase; la cámara corta al que habla y a la reacción del otro.'] : []),
    ...(input.character ? characterRules(input.character, style.slug === KYWAI_FILM && kitRobots) : []),
    ...ALIVE_ACTION,
    ...(FILM_3D.has(style.slug) ? ALIVE_3D : []),
    ...(input.source ? ['', 'El texto del que trata la película:', '"""', input.source, '"""'] : []),
    ...(input.files?.length ? ['', 'Archivos del usuario que puedes usar (lo que haya de material propio va en la película):', ...input.files] : []),
    ...(input.episode ? episodeRules(input.episode, true) : [])
  ]
  return [...head, ...common, ...extra].join('\n')
}

/** El MP4 que dejó el agente: pelicula.mp4, y si no, el más reciente de la carpeta (sin entrar en node_modules ni fotogramas). */
export function findFilm(work: string): string | null {
  const direct = join(work, FILM_FILE)
  if (existsSync(direct)) return direct
  let best: { file: string; at: number; size: number } | null = null
  const walk = (dir: string, depth: number): void => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e.name)
      if (e.isDirectory()) {
        if (depth < 3 && !e.name.startsWith('.') && !['node_modules', 'frames', 'cache', 'tmp'].includes(e.name)) walk(p, depth + 1)
      } else if (/\.mp4$/i.test(e.name)) {
        const s = statSync(p)
        // Lo más nuevo gana; a la par, el más grande (el montaje final pesa más que una prueba).
        if (s.size > 10_000 && (!best || s.mtimeMs > best.at + 1000 || (Math.abs(s.mtimeMs - best.at) <= 1000 && s.size > best.size))) best = { file: p, at: s.mtimeMs, size: s.size }
      }
    }
  }
  walk(work, 0)
  return best ? (best as { file: string }).file : null
}

/** «Título: …» de la respuesta del agente (si no lo puso, null). */
export function filmTitle(text: string): string | null {
  const m = /^\s*(?:t[ií]tulo|title)\s*:\s*[«"“]?(.+?)[»"”]?\s*$/im.exec(text)
  return m ? m[1].trim().slice(0, 90) : null
}

/** Para comprobar que no queda ninguno sin su ficha. */
export const FILM_SLUGS = FILM_STYLES.map((s) => s.slug)

// ---------- el kit de los robots de kywai (se escribe en src/ del kit al instalarlo) ----------

export const KYWAI_ROBOTS_JS = `// kywai-robots.js: los robots de kywai para Claude Animation Base (los escribe kywai al instalar el kit).
// Cárgalo en studio.html después de src/clawd.js. Úsalo dentro de un plano, entre camBegin() y camEnd().
//   kywaiRobot(kind, x, y, u, o)
//     kind: 'hermes' (el jefe: crema, pelo negro con dos moños y diadema dorada), 'claude' (naranja, mechón de llama),
//           'codex' (verde, cuerpo de cubo). Otro nombre con o.colors = ['#cuerpo', '#sombra'] para un robot nuevo.
//     (x, y): el suelo bajo el robot. u: la unidad (el robot mide unas 9u de alto; 30–40 a pantalla completa).
//     o: { eyes: 'normal'|'happy'|'think'|'wide'|'heart', look: -1…1, sq: aplastar(+)/estirar(-), dy: salto en u,
//          rot: giro, emote: un emote de clawd.js ('!', '?', 'dots', 'bulb', 'hearts'…), emoteK, emoteAge, colors }
//   kywaiSpark(x, y, r, k): la chispa de una tarea (bolita de luz), para pasarla de un robot a otro.
(() => {
  const VIS = '#1C1A24', EYE = '#FFE7A8';
  const BODY = { hermes: ['#F1E6CF', '#CDBB98'], claude: ['#EE8A3C', '#C9652A'], codex: ['#46B983', '#2E8C60'] };
  window.kywaiRobot = function (kind, x, y, u, o = {}) {
    const [col, dk] = o.colors || BODY[kind] || BODY.claude, sq = o.sq || 0;
    const float = (o.dy || 0) * u + wob(T, .5, kind.length * .3) * u * .25;
    const cube = kind === 'codex' || o.shape === 'cube';
    boilSeed('shadow' + kind);
    paint(ellPts(x, y, u * 3.4 * (1 + sq * .4), u * .7, 16), { wash: '#7A5236', washOp: 70, ink: null });
    push(); translate(x, y - u * 1.2 + float); rotate(o.rot || 0); scale(1 + sq * .35, 1 - sq * .35);
    const sw = clamp(u / 12, .6, 1.6);
    boilSeed('body' + kind);
    if (cube) paint(rrPts(-4.2 * u, -8.2 * u, 8.4 * u, 7.6 * u, 1.6 * u), { wash: col, ink: PAL.ink, sw });
    else paint(ellPts(0, -4.4 * u, 4 * u, 4.6 * u, 34), { wash: col, ink: PAL.ink, sw });
    if (cube) paint(rrPts(1.8 * u, -7.6 * u, 2 * u, 6.6 * u, 1 * u), { wash: dk, washOp: 150, ink: null });
    else paint(ellPts(1.9 * u, -4 * u, 1.6 * u, 3.6 * u, 20), { wash: dk, washOp: 140, ink: null });
    if (kind === 'claude') {
      const sway = wob(T, 1, .2) * .6 * u;
      paint(ribbon([[-.6 * u, -8.6 * u], [.4 * u + sway * .3, -10 * u], [1.8 * u + sway, -10.6 * u], [2.6 * u + sway, -9.6 * u]], 1.4 * u, .25 * u), { wash: col, ink: PAL.ink, sw });
    }
    if (kind === 'hermes') {
      boilSeed('hair');
      for (const s of [-1, 1]) paint(ellPts(s * 4.1 * u, -6.4 * u, 1.5 * u, 1.8 * u, 16), { wash: '#24222B', ink: PAL.ink, sw });
      paint([...ellPts(0, -7 * u, 4.3 * u, 2.6 * u, 24).filter(p => p[1] < -6.2 * u)], { wash: '#24222B', ink: PAL.ink, sw, curv: .4 });
      inkLine([[-3.6 * u, -7.4 * u], [0, -8.5 * u], [3.6 * u, -7.4 * u]], sw * 2.2, '#E8B53A', 'ink', .8);
    }
    boilSeed('visor' + kind);
    const vy = cube ? -5.4 * u : -4.6 * u;
    paint(rrPts(-3 * u, vy - 1.5 * u, 6 * u, 3 * u, 1.3 * u), { wash: VIS, ink: PAL.ink, sw: sw * .8 });
    const lx = (o.look || 0) * .6 * u, e = o.eyes || 'normal';
    for (const s of [-1, 1]) {
      const ex = s * 1.35 * u + lx, ey = vy;
      if (e === 'happy') inkLine([[ex - .7 * u, ey + .3 * u], [ex, ey - .5 * u], [ex + .7 * u, ey + .3 * u]], sw * 2.4, EYE, 'ink', .7);
      else if (e === 'think') inkLine([[ex - .7 * u, ey], [ex + .7 * u, ey - s * .15 * u]], sw * 2.2, EYE, 'ink', .2);
      else if (e === 'heart') paint(heartPts(ex, ey - .1 * u, .75 * u), { wash: '#FF7E9A', ink: null });
      else { const r = e === 'wide' ? .8 : .55; paint(ellPts(ex, ey, r * u, (r + .15) * u, 14), { wash: EYE, ink: null }); }
    }
    pop();
    if (e === 'normal' || e === 'wide') glow(x + lx, y - u * 1.2 + vy + float, u * 3.2, '#FFD27A', .25);
    if (o.emote) emote(o.emote, x + 3.6 * u, y - 11.5 * u + float, u * .9, o.emoteK ?? 1, o.emoteAge ?? T);
  };
  window.kywaiSpark = function (x, y, r, k = 1) {
    r *= 1.7;
    glow(x, y, r * 5, '#FFC766', .7 * k);
    boilSeed('spark');
    paint(starPts(x, y, r * (1 + .15 * wob(T, 3)), .45, 4, T * 2), { wash: '#FFF2C4', ink: '#D99A2B', sw: .8 });
  };
})();
`

export const KYWAI_KIT_GUIDE = `# Los robots de kywai en este kit

kywai usa este kit (Claude Animation Base) para sus películas pintadas a mano, pero con sus propios personajes:
los robots del equipo. El personaje del kit (Clawd) no sale nunca en una película de kywai.

- **Quiénes son.** Hermes es el jefe que reparte el trabajo (cuerpo de huevo crema, pelo negro con dos moños y
  diadema dorada). Claude es naranja, con un mechón de llama. Codex es verde y tiene el cuerpo de cubo. Los tres
  tienen una visera oscura con dos ojos de luz. Otros robots: otro nombre y \`o.colors\`.
- **Cómo se usan.** Carga \`src/kywai-robots.js\` en \`studio.html\` justo después de \`src/clawd.js\` y llama a
  \`kywaiRobot(kind, x, y, u, o)\` dentro de cada plano (ver la cabecera del archivo). \`kywaiSpark()\` dibuja la
  chispa de una tarea, el objeto que se pasan entre ellos.
- **Cómo actúan.** Todo lo de ANIMATION_GUIDE.md vale igual: anticipación, aplastar y estirar (\`sq\`), saltos
  (\`jump\`), sorpresa (\`take\`), emotes de \`clawd.js\` y miradas (\`look\`). No tienen boca: hablan con los ojos,
  el cuerpo y los emotes.
- **Formato.** El lienzo es 1920×1080. Para vertical, cambia el lienzo de \`studio.html\` a 1080×1920 y compón
  para ese encuadre.
- **Navegador.** Si no hay Google Chrome, \`render.mjs --chrome=<ruta>\` acepta el Chromium de Playwright.
  Sin tarjeta gráfica, \`--soft-gl\` y menos rellenos de acuarela (renderizan lento).
- **Sonido.** El kit no hace sonido: música y efectos con las herramientas que haya (las de Lemo-Opuscar en la
  carpeta hermana \`lemo-opuscar/core/audio\`, o sintetizados) y se juntan con ffmpeg.
`
