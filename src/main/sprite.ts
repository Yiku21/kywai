// «/sprite»: un personaje en pixel art listo para un videojuego (hoja de sprites, fotogramas sueltos, GIF y ZIP).
//
// Sale de un reel de una herramienta que convierte modelos 3D en sprites; kywai lo hace con sus agentes:
//  - Con la extensión PixelLab (servidor MCP oficial, Ajustes → Extensiones, con la clave del usuario), el agente usa
//    sus herramientas para crear el personaje en 4 u 8 direcciones y animarlo.
//  - Sin ella, el agente lo hace en el equipo: un modelo 3D adjunto (.glb, .gltf, .vrm, .fbx, .obj) se renderiza desde
//    cada dirección con Blender y se reduce a píxeles; una imagen adjunta se convierte a pixel art con Pillow.
// La orden va directa a un agente (sendDirect en orchestrator.ts) con el encargo que arma spritePrompt.

export const SPRITE_SIZES = [16, 32, 48, 64, 96, 128] as const
export type SpriteSize = (typeof SPRITE_SIZES)[number]

export interface SpriteRequest {
  /** Lo que el usuario cuenta del personaje (puede estar vacío si adjunta una imagen o un modelo). */
  what: string
  /** Alto del personaje en píxeles. */
  size: SpriteSize
  directions: 4 | 8
  /** Animaciones en inglés (walk, idle…), como las nombran los motores de juegos y PixelLab. */
  animations: string[]
}

/** Palabras con las que se piden las animaciones → su nombre de siempre en los juegos. */
const ANIMATIONS: [RegExp, string][] = [
  [/\b(reposo|quiet[oa]|respirar|idle)\b/i, 'idle'],
  [/\b(camina(?:r|ndo)?|andar|andando|walk(?:ing)?)\b/i, 'walk'],
  [/\b(corre(?:r)?|corriendo|run(?:ning)?)\b/i, 'run'],
  [/\b(salta(?:r)?|saltando|salto|jump(?:ing)?)\b/i, 'jump'],
  [/\b(ataca(?:r)?|ataque|espada(?:zo)?|golpe(?:ar)?|attack|sword)\b/i, 'attack'],
  [/\b(magia|hechizo|conjuro|spell(?:cast)?)\b/i, 'spellcast'],
  [/\b(saluda(?:r)?|saludo|wave)\b/i, 'wave'],
  [/\b(celebra(?:r)?|celebrando|victoria|celebrate|victory)\b/i, 'celebrate'],
  [/\b(muere|morir|muerte|die|death)\b/i, 'death'],
  [/\b(dispara(?:r)?|disparo|shoot(?:ing)?)\b/i, 'shoot']
]

const SIZE_RE = /(?:^|\s)(16|32|48|64|96|128)\s*(?:px|p[ií]xeles|pixels)?(?=\s|$|[,.;])/i
const DIR_RE = /(?:^|\s)(4|8|cuatro|ocho)\s*(?:direcciones|direcci[oó]n|directions|dirs?)(?=\s|$|[,.;])/i

/** «/sprite [64px] [8 direcciones] [caminar, correr…] [qué personaje]». null si no es la orden. */
export function parseSpriteRequest(text: string): SpriteRequest | null {
  const m = /^\/(?:sprites?|pixelart|pixel-art)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  let rest = ` ${m[1].trim()} `
  let size: SpriteSize = 64
  const s = SIZE_RE.exec(rest)
  if (s) {
    size = Number(s[1]) as SpriteSize
    rest = rest.replace(s[0], ' ')
  }
  let directions: 4 | 8 = 4
  const d = DIR_RE.exec(rest)
  if (d) {
    directions = /^(8|ocho)$/i.test(d[1]) ? 8 : 4
    rest = rest.replace(d[0], ' ')
  }
  const animations: string[] = []
  for (const [re, name] of ANIMATIONS) if (re.test(rest) && !animations.includes(name)) animations.push(name)
  if (!animations.length) animations.push('idle', 'walk')
  return { what: rest.replace(/\s{2,}/g, ' ').trim(), size, directions, animations }
}

/** Nombre de carpeta a partir de lo que se pidió («caballero con capa» → caballero-con-capa). */
export function spriteSlug(what: string): string {
  const s = what
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-')
  return s || 'personaje'
}

/** El encargo para el agente. `lang`: el idioma en que contesta al usuario. */
export function spritePrompt(req: SpriteRequest, input: { attachments: string[]; lang: string; stamp: string }): string {
  const dir = `sprites/${spriteSlug(req.what || input.attachments[0]?.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') || '')}-${input.stamp}`
  const dirs = req.directions === 8 ? 'sur, suroeste, oeste, noroeste, norte, noreste, este y sureste' : 'sur (de frente), oeste, norte (de espaldas) y este'
  return [
    'Haz un sprite de pixel art para un videojuego: un personaje animado, listo para importar en Godot, Unity, GameMaker o Phaser.',
    req.what ? `El personaje: ${req.what}` : 'El personaje: el de los archivos adjuntos.',
    ...(input.attachments.length ? [`Archivos adjuntos (ábrelos y míralos antes de empezar): ${input.attachments.join(', ')}`] : []),
    `Tamaño: el personaje mide unos ${req.size} px de alto, en un cuadro de ${req.size}×${req.size} px con fondo transparente (si hace falta sitio para brazos o armas, cuadro más grande, pero el personaje de ${req.size} px).`,
    `Direcciones: ${req.directions} (${dirs}).`,
    `Animaciones: ${req.animations.join(', ')} (4 a 8 fotogramas cada una; idle puede tener 2–4).`,
    '',
    'Cómo hacerlo (elige el primer camino que tengas):',
    '1. Si tienes las herramientas de PixelLab (servidor MCP «pixellab», la extensión de kywai), úsalas: crea el personaje con la descripción (o la imagen adjunta como referencia, si la herramienta lo admite) en el tamaño y las direcciones pedidas, añade cada animación y descarga lo que devuelva (PNG, ZIP o GIF). Las tareas de PixelLab tardan: espera a que terminen y comprueba cada resultado.',
    '2. Si hay un modelo 3D adjunto (.glb, .gltf, .vrm, .fbx u .obj) y no tienes PixelLab: renderízalo en este equipo con Blender en segundo plano (blender -b -P tu_script.py). Cámara ortográfica algo elevada (unos 30°), luz principal de lado y relleno suave, fondo transparente; gira el modelo 360°/direcciones para cada dirección y reproduce las animaciones que traiga el modelo (si no trae, haz un idle sencillo: subir y bajar 1–2 px). Renderiza a 4× el tamaño y redúcelo después. Si Blender no está, dilo y explica cómo instalarlo (blender.org, gratis); no inventes el resultado.',
    '3. Si hay una imagen adjunta (o solo una descripción) y no tienes PixelLab: hazlo con Python y Pillow. Con una imagen, recórtala al personaje, redúcela al tamaño pedido y pásala a pixel art (ver abajo); de una sola imagen solo sale la dirección que muestra y su espejo, y las animaciones serán sencillas (idle que respira, un paso con el cuerpo que sube y baja): dilo. Con solo una descripción, dibújalo tú cuadro a cuadro con código, sencillo y legible.',
    '',
    'Pixel art de verdad (en los caminos 2 y 3):',
    '- Reduce con promedio (Image.BOX) desde un tamaño mayor y amplía SIEMPRE con vecino más cercano (Image.NEAREST); nada de suavizado.',
    '- Paleta corta: como mucho 24 colores, iguales en todos los fotogramas (cuantiza con una paleta común).',
    '- Transparencia de todo o nada (alfa 0 o 255) y un contorno oscuro de 1 px alrededor del personaje.',
    '- Mismo encuadre y mismo punto de los pies en todos los fotogramas, para que no tiemble al animarse.',
    '',
    `Entrega en la carpeta ${dir}/ del proyecto:`,
    '- frames/<animación>_<dirección>_<n>.png: cada fotograma a su tamaño real.',
    '- hoja.png: la hoja de sprites (una fila por animación y dirección, una columna por fotograma, fondo transparente) y hoja.json con el tamaño del cuadro, qué hay en cada fila y los fotogramas por segundo.',
    '- <animación>.gif: una vista previa de cada animación ampliada 4× (vecino más cercano), mirando al frente.',
    `- ${dir.replace(/^.*\//, '')}.zip con todo lo anterior.`,
    '',
    'Reglas: nada de logos ni marcas; no copies personajes con derechos de otros salvo que el usuario diga que son suyos; no subas nada a ningún sitio salvo a PixelLab si usas su extensión.',
    `Al terminar, contesta al usuario en ${input.lang}, en pocas líneas: qué camino usaste, qué animaciones y direcciones salieron y dónde está cada archivo. Si algo no se pudo (por ejemplo, 8 direcciones desde una sola imagen), dilo claro.`
  ].join('\n')
}
