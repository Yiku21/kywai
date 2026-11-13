// Aspectos de las imágenes con IA: cómo se pintan las imágenes de un vídeo rápido, con presentador, mixto o de charla
// (las que hacen ComfyUI o Gemini). No son películas de la biblioteca (filmStyles.ts, que un agente dirige con código):
// el guion y el montaje son los de siempre y solo cambia el aspecto de cada imagen, siempre el mismo en todo el vídeo.
// Se eligen en el paso 3 del selector de /video (marca «aspecto:…») y se pueden probar antes con la escena del usuario.
// Los nombres son genéricos a propósito: ni estudios ni canales ni marcas.

export interface ImageLook {
  id: string
  /** Nombre en español. */
  name: string
  en: string
  /** Una línea: cómo se ve. */
  line: string
  lineEn: string
  /** El bloque de estilo, en inglés: va al final de cada imagen para que todas salgan iguales. */
  prompt: string
  /** Colores de su tarjeta en el selector (degradado), mientras no hay una prueba con la escena del usuario. */
  colors: [string, string]
}

export const IMAGE_LOOKS: ImageLook[] = [
  {
    id: 'cine-3d',
    name: 'Animación 3D de cine',
    en: '3D animated feature',
    line: 'Personajes 3D expresivos, de ojos grandes, con luz de película de animación.',
    lineEn: 'Expressive big-eyed 3D characters with animated-feature lighting.',
    prompt:
      'Modern 3D animated feature film style: appealing stylised characters with large expressive eyes and soft rounded shapes, subsurface-scattered skin, rich saturated colours, cinematic warm key light with cool rim light, soft global illumination, shallow depth of field, polished family-movie render',
    colors: ['#2b5fd9', '#f0a35e']
  },
  {
    id: 'plastilina',
    name: 'Plastilina',
    en: 'Claymation',
    line: 'Figuras de plastilina hechas a mano, con huellas de dedos y luz de estudio.',
    lineEn: 'Handmade clay figures with fingerprints and studio light.',
    prompt:
      'Stop-motion claymation style: every character and object sculpted from matte plasticine with visible fingerprints and tool marks, slightly lumpy handmade shapes, miniature practical set, warm tungsten studio lighting with soft shadows, tiny depth of field like a tabletop model',
    colors: ['#c4582b', '#f2c26b']
  },
  {
    id: 'ganchillo',
    name: 'Ganchillo de lana',
    en: 'Wool crochet',
    line: 'Todo tejido a ganchillo: personajes y decorado de lana, como amigurumis.',
    lineEn: 'Everything crocheted: amigurumi characters and a yarn set.',
    prompt:
      'Crochet amigurumi style: every character, object and background is knitted from soft wool yarn with clearly visible crochet stitches and fuzzy fibres, chunky rounded shapes, button-like eyes, cosy pastel and muted colours, soft diffused light like a handmade toy photographed on a table',
    colors: ['#7c8fd6', '#e8b4c8']
  },
  {
    id: 'chibi-3d',
    name: 'Chibi 3D',
    en: 'Chibi 3D',
    line: 'Muñecos 3D de cabeza enorme y cuerpo pequeño, tiernos y brillantes.',
    lineEn: 'Cute 3D figures with huge heads and tiny bodies.',
    prompt:
      'Chibi 3D vinyl toy style: super-deformed characters with oversized heads, tiny bodies and big sparkling eyes, smooth glossy plastic materials, candy-bright colours, soft studio lighting with gentle reflections, clean simple background, adorable collectible-figure look',
    colors: ['#4aa3f0', '#b7e3ff']
  },
  {
    id: 'comic',
    name: 'Cómic',
    en: 'Comic book',
    line: 'Tinta negra marcada, tramas de puntos y colores planos de tebeo.',
    lineEn: 'Bold black ink, halftone dots and flat comic colours.',
    prompt:
      'Comic book illustration: bold confident black ink outlines with varied line weight, dramatic hatching, flat vivid colours with halftone dot shading, strong poses and foreshortening, dynamic panel-like framing, printed-page texture',
    colors: ['#e23b3b', '#ffd23f']
  },
  {
    id: 'pergamino',
    name: 'Pergamino',
    en: 'Parchment sketch',
    line: 'Dibujo a tinta y acuarela sobre papel viejo, como un cuaderno antiguo.',
    lineEn: 'Ink and wash sketch on aged paper, like an old notebook.',
    prompt:
      'Illustrated parchment style: loose pen-and-ink sketch with light watercolour washes on aged, stained cream parchment paper with torn soft edges, sepia and faded muted colours, hand-drawn cross-hatching, storybook journal feeling',
    colors: ['#a8814f', '#efe0bd']
  },
  {
    id: 'objeto-que-habla',
    name: 'Objeto que habla',
    en: 'Talking object',
    line: 'Un objeto de la escena cobra vida con cara y gestos, y es el protagonista.',
    lineEn: 'An object in the scene comes alive with a face and is the star.',
    prompt:
      'Talking-object style: the most important everyday object in the scene is alive, with a big expressive cartoon face (eyes and mouth) and little arms, shown as the hero in the foreground; photoreal 3D render of a real environment, warm cinematic light, the living object glows slightly, playful and funny',
    colors: ['#f08a24', '#3a2a1e']
  },
  {
    id: 'explicador-3d',
    name: 'Explicador 3D con esqueleto',
    en: '3D explainer (x-ray)',
    line: 'Render 3D hiperrealista que enseña por dentro: huesos, órganos o piezas.',
    lineEn: 'Hyper-real 3D render that shows the inside: bones, organs or parts.',
    prompt:
      'Hyper-realistic 3D explainer render: glossy CGI with a slightly uncanny realism, cut-away and x-ray views that reveal the skeleton, organs or inner mechanism, clean dark studio background, dramatic rim lighting, medical-visualisation detail, close dramatic camera angles',
    colors: ['#1d2b3a', '#9fb7c9']
  },
  {
    id: 'realista-ugc',
    name: 'Realista (podcast o UGC)',
    en: 'Real (podcast or UGC)',
    line: 'Como grabado con el móvil o en un pódcast: personas reales, luz de casa.',
    lineEn: 'Like a phone recording or a podcast: real people, home light.',
    prompt:
      'Authentic user-generated content photo: shot on a smartphone or a podcast camera, real people with natural skin texture, candid expressions, home or small-studio setting with a warm practical lamp and a microphone where it fits, slight grain, natural colour, no studio polish',
    colors: ['#3d3d3d', '#c9a27a']
  }
]

export function imageLook(id: string | null | undefined): ImageLook | undefined {
  return id ? IMAGE_LOOKS.find((l) => l.id === id) : undefined
}

/** Cómo lo pide la gente con palabras («estilo plastilina», «aspecto cómic», «estilo pixar»…), sin acentos. */
const LOOK_ALIASES: Record<string, string[]> = {
  'cine-3d': ['animacion 3d de cine', 'animacion 3d', 'pixar', 'disney pixar', 'peli de animacion', 'pelicula de animacion', '3d animated'],
  plastilina: ['plastilina', 'claymation', 'clay', 'stop motion de plastilina'],
  ganchillo: ['ganchillo', 'ganchillo de lana', 'crochet', 'wool crochet', 'amigurumi', 'lana', 'tejido'],
  'chibi-3d': ['chibi', 'chibi 3d'],
  comic: ['comic', 'tebeo', 'historieta', 'comic book'],
  pergamino: ['pergamino', 'parchment', 'papel antiguo', 'cuaderno antiguo'],
  'objeto-que-habla': ['objeto que habla', 'objeto parlante', 'talking object', 'objetos que hablan'],
  'explicador-3d': ['explicador 3d', 'explicador 3d con esqueleto', 'esqueleto', 'skeleton', 'rayos x', 'zack d films'],
  'realista-ugc': ['realista', 'ugc', 'ugc real', 'podcast', 'podcast real', 'realista tipo ugc']
}

const plain = (x: string): string =>
  x
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * «/video estilo plastilina sobre la luna» → el aspecto y el resto del texto. Solo detrás de «estilo» o «aspecto» (y
 * de la frase más larga a la más corta), para no confundir el tema («un vídeo sobre el esqueleto humano»).
 */
export function takeImageLook(text: string): { look: ImageLook; rest: string } | null {
  const m = /(^|[\s,])(?:(?:al|en|con|de)\s+)?(?:estilo|aspecto|look|style)\s+(?:de\s+)?(.+)$/i.exec(text)
  if (!m) return null
  const after = m[2].split(/\s+/)
  for (let n = Math.min(5, after.length); n >= 1; n--) {
    const q = plain(after.slice(0, n).join(' '))
    const look = IMAGE_LOOKS.find((l) => l.id === q.replace(/ /g, '-') || plain(l.name) === q || plain(l.en) === q || (LOOK_ALIASES[l.id] ?? []).includes(q))
    if (look) {
      const rest = (text.slice(0, m.index) + m[1] + after.slice(n).join(' ')).replace(/^\s*[,:;]\s*/, '').replace(/[\s,:;]+$/, '').replace(/\s{2,}/g, ' ').trim()
      return { look, rest }
    }
  }
  return null
}
