// Estilos de película del estudio de vídeo: la biblioteca Lemo-Opuscar (66 estilos hechos solo con código, MIT,
// github.com/lemomo-ai/lemo-opuscar) y el estilo propio «pintado a mano con los robots de kywai» (sobre Claude Animation
// Base, MIT, github.com/JohnHeibel/ClaudeAnimationBase). Con uno de ellos, «/video estilo acuarela …» no pasa por el
// guion de escenas: un agente con herramientas dirige y renderiza la película siguiendo la guía de ese estilo.

export type FilmCategory =
  | 'kywai'
  | 'dibujo'
  | 'asia'
  | 'grabado'
  | 'grafico'
  | 'info'
  | 'animacion'
  | 'juegos'
  | 'cine'
  | 'materiales'
  | 'datos'
  | 'documental'

export interface FilmStyle {
  /** Carpeta en la biblioteca (styles/<slug>) o «kywai-pintado». */
  slug: string
  /** Nombre en español. */
  name: string
  /** Nombre original, en inglés (también vale para pedirlo). */
  en: string
  category: FilmCategory
  /** Una línea: cómo se ve y para qué sirve. */
  line: string
  /** La misma línea en inglés (la interfaz en otros idiomas usa el nombre y la línea en inglés). */
  lineEn: string
  /** Pide clave de Gemini o material real (mapas, escaneos, archivos de época) además del tema. */
  needs?: 'material'
  /**
   * Estilo propio de kywai (su guía está en src/main/kywaiFilmGuides.ts): el estilo de la biblioteca cuyo motor usa.
   * Su muestra es un fotograma hecho por kywai, no de una película de la biblioteca.
   */
  base?: string
}

export const FILM_CATEGORIES: { id: FilmCategory; name: string; en: string }[] = [
  { id: 'kywai', name: 'Hecho por kywai', en: 'Made by kywai' },
  { id: 'dibujo', name: 'Dibujo y pintura', en: 'Hand-drawn & painting' },
  { id: 'animacion', name: 'Dibujos animados y anime', en: 'Cartoon & anime' },
  { id: 'juegos', name: 'Videojuegos', en: 'Games' },
  { id: 'grafico', name: 'Gráfico y tipografía', en: 'Graphic & type' },
  { id: 'info', name: 'Explicar y presentar', en: 'Explain & present' },
  { id: 'grabado', name: 'Grabado e impresión', en: 'Print & printmaking' },
  { id: 'asia', name: 'Tradiciones de Asia oriental', en: 'East Asian traditions' },
  { id: 'materiales', name: 'Materiales y 3D', en: 'Materials & 3D' },
  { id: 'cine', name: 'Cine de época', en: 'Cinema & eras' },
  { id: 'datos', name: 'Documentales con datos reales', en: 'Evidence films' },
  { id: 'documental', name: 'Montaje y documental', en: 'Edit & documentary' }
]

/** El estilo propio: dibujos pintados a mano (sin otro personaje elegido, con Hermes, Claude y Codex de protagonistas). */
export const KYWAI_FILM = 'kywai-pintado'

export const FILM_STYLES: FilmStyle[] = [
  { slug: KYWAI_FILM, name: 'Pintado a mano (acuarela y tinta)', en: 'Hand-painted (watercolour and ink)', category: 'kywai', line: 'Acuarela y tinta que se mueven como dibujos animados; sin texto, todo se cuenta actuando. Sin personaje elegido, salen los robots de kywai.', lineEn: 'Watercolour and ink that move like a cartoon; no text, everything is told by acting. With no character chosen, the kywai robots star.' },
  // Dibujo y pintura
  { slug: 'crayon-book', name: 'Cuento de ceras', en: 'Crayon Picture Book', category: 'dibujo', line: 'Álbum infantil pintado con ceras; ideal para cuentos y explicar a niños.', lineEn: 'A children\'s picture book painted in crayon; great for stories and explaining to kids.' },
  { slug: 'watercolor', name: 'Acuarela', en: 'Watercolor Brush', category: 'dibujo', line: 'Pinceladas de acuarela que se van pintando en un paseo continuo.', lineEn: 'Watercolour strokes painted in one continuous journey.' },
  { slug: 'ink-wash', name: 'Tinta china', en: 'Chinese Ink Wash', category: 'dibujo', line: 'Aguadas de tinta negra con mucho blanco; épico y poético.', lineEn: 'Black ink washes with lots of white space; epic and poetic.' },
  { slug: 'impasto', name: 'Óleo empastado', en: 'Impasto Oil Painting', category: 'dibujo', line: 'Óleo grueso con relieve de pincel; emotivo y lleno de color.', lineEn: 'Thick oil paint with brush relief; emotional and full of colour.' },
  { slug: 'one-line', name: 'Dibujo de una sola línea', en: 'One-line Drawing', category: 'dibujo', line: 'Una línea que nunca se corta dibuja toda la historia.', lineEn: 'A single unbroken line draws the whole story.' },
  { slug: 'whiteboard', name: 'Pizarra blanca', en: 'Whiteboard Explainer', category: 'dibujo', line: 'Rotulador que dibuja la explicación mientras habla; para enseñar cómo funciona algo.', lineEn: 'A marker draws the explanation as it talks; for showing how something works.' },
  { slug: 'urban-sketch', name: 'Apunte urbano', en: 'Urban Sketch · Pen & Wash', category: 'dibujo', line: 'Bocetos de plumilla con manchas de color; lugares, viajes y ciudades.', lineEn: 'Pen sketches with splashes of colour; places, travel and cities.' },
  { slug: 'chalkboard', name: 'Pizarra de tiza', en: 'Chalkboard', category: 'dibujo', line: 'Tiza que escribe, borra y vuelve a escribir; una clase con encanto.', lineEn: 'Chalk that writes, erases and writes again; a charming lesson.' },
  { slug: 'kywai-ink-doodle', name: 'Garabatos de tinta', en: 'Ink Doodle', category: 'dibujo', base: 'whiteboard', line: 'Garabatos de boli negro en una libreta que se dibujan mientras habla; flechas, cajas y monigotes.', lineEn: 'Black pen doodles in a notebook, drawn as it talks; arrows, boxes and stick figures.' },
  { slug: 'kywai-pov-doodle', name: 'Garabatos en primera persona', en: 'POV Doodle', category: 'dibujo', base: 'midcentury-toon', line: 'Lo ves todo con tus ojos y tus manos dibujadas; la historia te pasa a ti.', lineEn: 'Everything seen through your eyes with your drawn hands; the story happens to you.' },
  // Dibujos animados y anime
  { slug: 'rubber-hose', name: 'Dibujos de los años 30', en: '1930s Rubber Hose Cartoon', category: 'animacion', line: 'Blanco y negro, brazos de goma, guantes blancos y jazz; todo baila.', lineEn: 'Black and white, rubber arms, white gloves and jazz; everything dances.' },
  { slug: 'cel-anime-80s', name: 'Anime de los 80', en: '80s Cel Anime', category: 'animacion', line: 'Anime de celuloide con neones y lluvia; aventura y acción.', lineEn: 'Cel anime with neon and rain; adventure and action.' },
  { slug: 'scifi-toon', name: 'Comedia de ciencia ficción', en: 'Sci-Fi Sitcom Toon', category: 'animacion', line: 'Dibujos de comedia con portales y universos raros.', lineEn: 'A comedy cartoon with portals and strange universes.' },
  { slug: 'midcentury-toon', name: 'Dibujos de los años 50', en: 'Mid-century Cartoon', category: 'animacion', line: 'Película educativa de los 50 con formas planas; perfecta para tutoriales.', lineEn: 'A 1950s educational film with flat shapes; perfect for tutorials.' },
  { slug: 'kywai-paper-diorama', name: 'Papel recortado', en: 'Paper Craft Diorama', category: 'animacion', base: 'game-show', line: 'Un teatrillo de cartulina con una mascota de papel, un contador grande y las palabras en etiquetas; para listas y «top 5».', lineEn: 'A cardboard stage with a paper mascot, a big counter and words on paper labels; for lists and “top 5” videos.' },
  { slug: 'kywai-office-flat', name: 'Oficina en plano', en: 'Flat Office Cartoon', category: 'animacion', base: 'midcentury-toon', line: 'Gente trabajando en ilustración plana sin contornos, con carteles de «Semana 2»; para equipos y procesos.', lineEn: 'People at work in flat outline-free illustration, with “Week 2” cards; for teams and processes.' },
  // Videojuegos
  { slug: 'pixel-rpg', name: 'Pixel RPG de 16 bits', en: '16-bit Pixel RPG', category: 'juegos', line: 'Videojuego de rol de los 90: cuadros de diálogo, menús, combates y subidas de nivel.', lineEn: 'A 90s role-playing game: dialogue boxes, menus, battles and level-ups.' },
  { slug: 'hd-2d', name: 'HD-2D', en: 'HD-2D', category: 'juegos', line: 'Píxeles con luces y profundidad modernas; aventura épica.', lineEn: 'Pixels with modern lighting and depth; an epic adventure.' },
  { slug: 'microgame', name: 'Minijuegos frenéticos', en: 'Microgame Frenzy', category: 'juegos', line: 'Retos de cinco segundos cada vez más rápidos; muy enérgico.', lineEn: 'Five-second challenges that keep getting faster; very energetic.' },
  { slug: 'game-show', name: 'Concurso de la tele', en: 'Game Show Flat', category: 'juegos', line: 'Un concurso con marcadores y ritmo; para rankings y comparativas.', lineEn: 'A TV game show with scoreboards and rhythm; for rankings and comparisons.' },
  // Gráfico y tipografía
  { slug: 'swiss-motion', name: 'Diseño suizo animado', en: 'Swiss Motion Graphics', category: 'grafico', line: 'Rejilla, un color de acento y todo al compás; limpio y profesional.', lineEn: 'Grid, one accent colour and everything on the beat; clean and professional.' },
  { slug: 'spy-titles', name: 'Créditos de espías de los 60', en: '60s Spy Title Sequence', category: 'grafico', line: 'Siluetas y formas que persiguen al ritmo de jazz; para presentar algo con estilo.', lineEn: 'Silhouettes and shapes chasing to a jazz beat; for presenting something with style.' },
  { slug: 'art-deco', name: 'Art déco', en: 'Art Deco', category: 'grafico', line: 'Dorados y geometría de los años 20 y 30; elegante.', lineEn: 'Gold and geometry from the 1920s and 30s; elegant.' },
  { slug: 'blueprint', name: 'Plano técnico', en: 'Blueprint', category: 'grafico', line: 'Plano azul que se dibuja, se despieza y se monta; para inventos y productos.', lineEn: 'A blue plan that draws, explodes and assembles itself; for inventions and products.' },
  { slug: 'stained-glass', name: 'Vidriera', en: 'Stained Glass', category: 'grafico', line: 'Una vidriera que se ilumina panel a panel.', lineEn: 'A stained-glass window that lights up panel by panel.' },
  { slug: 'pictogram-motion', name: 'Pictogramas', en: 'Pictogram Motion', category: 'grafico', line: 'Iconos de señalética que cuentan la historia; claro y universal.', lineEn: 'Signage icons tell the story; clear and universal.' },
  { slug: 'ascii-crt', name: 'Terminal ASCII', en: 'ASCII / CRT Terminal', category: 'grafico', line: 'Pantalla de ordenador antiguo con caracteres; ciencia ficción retro.', lineEn: 'An old computer screen made of characters; retro sci-fi.' },
  { slug: 'kywai-neon-silhouette', name: 'Siluetas de neón', en: 'Neon Silhouette', category: 'grafico', base: 'spy-titles', line: 'Siluetas negras contra cielos de neón magenta y cian, con música synthwave.', lineEn: 'Black silhouettes against magenta and cyan neon skies, with synthwave music.' },
  // Explicar y presentar
  { slug: 'dataviz', name: 'Historias con gráficas', en: 'Data Storytelling', category: 'info', line: 'La gráfica cuenta la historia; para datos y cifras.', lineEn: 'The chart tells the story; for data and figures.' },
  { slug: 'iso-infographic', name: 'Infografía isométrica', en: 'Isometric Infographic', category: 'info', line: 'Un mundo isométrico que muestra un proceso paso a paso.', lineEn: 'An isometric world showing a process step by step.' },
  { slug: 'dark-keynote', name: 'Presentación tecnológica', en: 'Dark Tech Keynote', category: 'info', line: 'Lanzamiento de producto en fondo oscuro; para presentar apps.', lineEn: 'A product launch on a dark background; for presenting apps.' },
  { slug: 'living-screencast', name: 'Captura de pantalla viva', en: 'Living Screencast', category: 'info', line: 'Una app de verdad en pantalla con un personaje que la recorre; para enseñar software.', lineEn: 'A real app on screen with a character walking through it; for showing software.' },
  { slug: 'hologram-hud', name: 'Holograma de ciencia ficción', en: 'Sci-fi Hologram HUD', category: 'info', line: 'Escaneo holográfico con marcadores; para enseñar las piezas de un producto.', lineEn: 'A holographic scan with markers; for showing the parts of a product.' },
  { slug: 'transit-map', name: 'Mapa de metro', en: 'Transit Map', category: 'info', line: 'Un plano de metro que crece; para cronologías y redes.', lineEn: 'A metro map that grows; for timelines and networks.' },
  { slug: 'isometric-picture-book', name: 'Álbum isométrico', en: 'Isometric Picture Book', category: 'info', line: 'Escenas isométricas con muñequitos que explican por qué algo funciona así.', lineEn: 'Isometric scenes with little figures explaining why something works the way it does.' },
  { slug: 'circuit-board', name: 'Placa de circuito', en: 'Circuit Board', category: 'info', line: 'La energía corre por pistas de cobre; para explicar cómo llega algo de A a B.', lineEn: 'Energy runs along copper tracks; for explaining how something gets from A to B.' },
  // Grabado e impresión
  { slug: 'risograph', name: 'Risografía', en: 'Risograph Print', category: 'grabado', line: 'Tintas que se suman capa a capa con su trama; fresco y artesanal.', lineEn: 'Inks adding up layer by layer with their grain; fresh and handmade.' },
  { slug: 'halftone-dossier', name: 'Expediente de trama', en: 'Halftone Dossier', category: 'grabado', line: 'Recortes de prensa en trama de puntos; para casos y juicios con humor.', lineEn: 'Halftone press clippings; for cases and trials with humour.' },
  { slug: 'woodcut', name: 'Xilografía', en: 'Woodcut Print', category: 'grabado', line: 'Grabado en madera en blanco y negro; leyendas y historias antiguas.', lineEn: 'Black-and-white woodcut; legends and old stories.' },
  { slug: 'engraving', name: 'Grabado en cobre', en: 'Copperplate Engraving', category: 'grabado', line: 'Lámina de enciclopedia antigua que se graba línea a línea; ciencia y naturaleza.', lineEn: 'An old encyclopaedia plate engraved line by line; science and nature.' },
  { slug: 'silkscreen-poster', name: 'Cartel serigrafiado de viajes', en: 'Silkscreen Travel Poster', category: 'grabado', line: 'Carteles de viaje a sangre, uno tras otro.', lineEn: 'Full-bleed travel posters, one after another.' },
  { slug: 'printed-long-take', name: 'Plano secuencia impreso', en: 'Printed Long Take', category: 'grabado', line: 'Una sola toma en rascado, como una ilustración que se mueve.', lineEn: 'A single scratchboard take, like an illustration that moves.' },
  // Tradiciones de Asia oriental
  { slug: 'shadow-puppet', name: 'Teatro de sombras', en: 'Shadow Puppetry', category: 'asia', line: 'Marionetas de cuero tras una pantalla iluminada; mitos y leyendas.', lineEn: 'Leather puppets behind a lit screen; myths and legends.' },
  { slug: 'ukiyoe', name: 'Ukiyo-e', en: 'Ukiyo-e', category: 'asia', line: 'Cada plano es una estampa japonesa de madera.', lineEn: 'Every shot is a Japanese woodblock print.' },
  { slug: 'papercut-red', name: 'Papel recortado rojo', en: 'Red Paper-cut', category: 'asia', line: 'Recortes de papel rojo de fiesta; celebraciones y cuentos.', lineEn: 'Festive red paper-cuts; celebrations and tales.' },
  { slug: 'paper-lantern', name: 'Farolillo de papel', en: 'Paper-cut Lightbox', category: 'asia', line: 'Siluetas de papel con luz detrás, en capas; nostálgico.', lineEn: 'Layered paper silhouettes lit from behind; nostalgic.' },
  // Materiales y 3D
  { slug: 'brick-toy', name: 'Piezas de construcción', en: 'Brick Toy', category: 'materiales', line: 'Un mundo de piezas de juguete en 3D.', lineEn: 'A 3D world made of toy bricks.' },
  { slug: 'paper-popup', name: 'Libro desplegable', en: 'Paper Pop-up Book', category: 'materiales', line: 'Un libro de papel que se abre y se levanta en 3D.', lineEn: 'A paper book that opens and pops up in 3D.' },
  { slug: 'tilt-shift', name: 'Maqueta en miniatura', en: 'Tilt-Shift Miniature', category: 'materiales', line: 'Una ciudad que parece de juguete, con desenfoque de maqueta.', lineEn: 'A city that looks like a toy, with model-style blur.' },
  { slug: 'lowpoly-island', name: 'Isla low-poly', en: 'Low-poly Isometric Island', category: 'materiales', line: 'Una isla 3D que crece pieza a pieza al ritmo de la música.', lineEn: 'A 3D island that grows piece by piece to the music.' },
  { slug: 'glass-product', name: 'Producto de cristal', en: 'Glass Product Render', category: 'materiales', line: 'Anuncio de producto con cristal, reflejos y luces de estudio.', lineEn: 'A product ad with glass, reflections and studio lights.' },
  { slug: 'memphis-diorama', name: 'Diorama Memphis', en: 'Memphis Diorama', category: 'materiales', line: 'Un diorama de colores de los 80 que gira por las estaciones.', lineEn: 'A colourful 80s diorama that turns through the seasons.' },
  { slug: 'desktop-flythrough', name: 'Vuelo por el escritorio', en: 'Desktop Flythrough', category: 'materiales', line: 'Tarjetas de apps sobre un escritorio en 3D; para enseñar un flujo entre apps.', lineEn: 'App cards over a 3D desktop; for showing a flow between apps.' },
  { slug: 'kywai-crystal-3d', name: 'Cristales 3D adorables', en: 'Cute 3D Crystals', category: 'materiales', base: 'glass-product', line: 'Cristales brillantes con carita en un estudio pastel; hacen amable la tecnología.', lineEn: 'Glossy crystals with little faces in a pastel studio; they make tech feel friendly.' },
  // Cine de época
  { slug: 'silent-film', name: 'Cine mudo de los años 20', en: '1920s Silent Film', category: 'cine', line: 'Blanco y negro, rótulos y piano; comedia física.', lineEn: 'Black and white, title cards and piano; physical comedy.' },
  { slug: 'backrooms', name: 'Grabación encontrada', en: 'Liminal Found Footage', category: 'cine', line: 'Cámara en mano en un lugar vacío e inquietante; misterio.', lineEn: 'Handheld camera in an empty, unsettling place; mystery.' },
  { slug: 'kywai-deep-time', name: 'Tiempo profundo', en: 'Deep Time', category: 'cine', base: 'lowpoly-island', line: 'Millones de años en segundos: un planeta que cambia y un contador de años; lento y épico.', lineEn: 'Millions of years in seconds: a changing planet and a year counter; slow and epic.' },
  // Documentales con datos reales
  { slug: 'satellite-briefing', name: 'Informe por satélite', en: 'Satellite Briefing', category: 'datos', line: 'Imágenes de satélite reales con datos con su fuente.', lineEn: 'Real satellite imagery with sourced data.', needs: 'material' },
  { slug: 'briefing-board', name: 'Tablero de ingeniería', en: 'Engineering Briefing Board', category: 'datos', line: 'Comparar opciones técnicas en un tablero con pruebas y medidas.', lineEn: 'Comparing technical options on a board with evidence and measurements.', needs: 'material' },
  { slug: 'lidar-survey', name: 'Escaneo LiDAR', en: 'LiDAR Survey', category: 'datos', line: 'Nubes de puntos láser que destapan lo oculto en un terreno.', lineEn: 'Laser point clouds that uncover what is hidden in a landscape.', needs: 'material' },
  { slug: 'white-model', name: 'Proyección sobre maqueta blanca', en: 'Projection on White Model', category: 'datos', line: 'Un proyector pinta la historia de una ciudad sobre su maqueta.', lineEn: 'A projector paints a city\'s story onto its white model.', needs: 'material' },
  { slug: 'data-physical', name: 'Datos hechos objetos', en: 'Data Physicalization', category: 'datos', line: 'Las cifras se convierten en piezas reales que se apilan.', lineEn: 'Figures turn into real objects that stack up.', needs: 'material' },
  { slug: 'teardown', name: 'Despiece de producto', en: 'Exploded Teardown', category: 'datos', line: 'Un aparato se abre pieza a pieza con sus medidas reales.', lineEn: 'A device opens piece by piece with its real measurements.', needs: 'material' },
  { slug: 'microscope', name: 'Historia al microscopio', en: 'Microscope Story', category: 'datos', line: 'Un viaje continuo hacia lo diminuto, con medidas.', lineEn: 'A continuous journey into the tiny, with measurements.', needs: 'material' },
  { slug: 'archive-lighttable', name: 'Mesa de luz de archivo', en: 'Archive Light Table', category: 'datos', line: 'Documentos y negativos antiguos bajo la lupa.', lineEn: 'Old documents and negatives under the loupe.', needs: 'material' },
  // Montaje y documental
  { slug: 'caption-news', name: 'Noticia con subtítulos', en: 'Caption News', category: 'documental', line: 'Noticia corta que se entiende sin sonido; para redes.', lineEn: 'A short news piece you can follow without sound; for social media.', needs: 'material' },
  { slug: 'newsreel', name: 'Noticiario de los años 20', en: '1920s Newsreel', category: 'documental', line: 'Noticiario de época con imágenes de archivo.', lineEn: 'A period newsreel with archive footage.', needs: 'material' },
  { slug: 'countdown', name: 'Cuenta atrás en pantalla partida', en: 'Live Countdown Split-screen', category: 'documental', line: 'Un minuto de cuenta atrás en varias pantallas a la vez.', lineEn: 'A one-minute countdown across several screens at once.', needs: 'material' },
  { slug: 'city-symphony', name: 'Sinfonía a cámara rápida', en: 'Time-lapse Symphony', category: 'documental', line: 'Un día entero de una ciudad a cámara rápida y al compás.', lineEn: 'A whole day in a city, in time-lapse and on the beat.', needs: 'material' },
  { slug: 'visual-investigation', name: 'Investigación visual', en: 'Visual Investigation', category: 'documental', line: 'Varias fuentes sincronizadas en un mismo reloj para reconstruir un hecho.', lineEn: 'Several sources synced on one clock to reconstruct an event.', needs: 'material' },
  { slug: 'kino-montage', name: 'Montaje constructivista', en: 'Constructivist Montage', category: 'documental', line: 'Montaje soviético con archivo y cifras; contundente.', lineEn: 'Soviet montage with archive and figures; hard-hitting.', needs: 'material' },
  { slug: 'telestrator', name: 'Pizarra de fútbol', en: 'Sports Telestrator', category: 'documental', line: 'Congelar la jugada, dibujar encima y analizarla.', lineEn: 'Freeze the play, draw over it and analyse it.', needs: 'material' },
  { slug: 'news-package', name: 'Informativo de televisión', en: 'Broadcast News Package', category: 'documental', line: 'Un bloque de noticias con rótulos, titulares y tablas.', lineEn: 'A news segment with captions, headlines and tables.', needs: 'material' }
]

const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export function filmStyle(slug: string): FilmStyle | undefined {
  return FILM_STYLES.find((s) => s.slug === slug)
}

/** Nombres cortos con los que la gente lo pide («estilo pixel», «estilo acuarela», «años 30»…). */
const ALIASES: Record<string, string[]> = {
  [KYWAI_FILM]: ['kywai', 'robots', 'pintado a mano', 'robots de kywai', 'claude animation'],
  'pixel-rpg': ['pixel', 'pixel art', 'pixeles', 'rpg', '16 bits', 'videojuego', 'retro'],
  'rubber-hose': ['anos 30', 'rubber hose', 'blanco y negro', 'cartoon antiguo', 'dibujos antiguos'],
  watercolor: ['acuarela'],
  whiteboard: ['pizarra blanca', 'pizarra'],
  chalkboard: ['tiza'],
  'cel-anime-80s': ['anime'],
  ukiyoe: ['japones', 'estampa japonesa'],
  'silent-film': ['cine mudo', 'mudo'],
  'brick-toy': ['lego', 'piezas'],
  'ink-wash': ['tinta'],
  impasto: ['oleo'],
  'midcentury-toon': ['anos 50'],
  'iso-infographic': ['infografia', 'isometrico'],
  'dark-keynote': ['keynote', 'presentacion'],
  'paper-popup': ['pop up', 'desplegable'],
  'shadow-puppet': ['sombras'],
  'swiss-motion': ['suizo', 'minimalista'],
  'kywai-ink-doodle': ['garabatos', 'doodle', 'ink doodle', 'boli', 'libreta'],
  'kywai-pov-doodle': ['pov', 'primera persona', 'pov doodle'],
  'kywai-office-flat': ['oficina', 'corporativo', 'ilustracion plana'],
  'kywai-paper-diorama': ['diorama de papel', 'cartulina', 'papercraft', 'paper craft', 'manualidad', 'teatrillo de papel'],
  'kywai-neon-silhouette': ['neon', 'siluetas', 'synthwave'],
  'kywai-crystal-3d': ['cristales', 'cristal', 'gemas'],
  'kywai-deep-time': ['tiempo profundo', 'deep time', 'millones de anos']
}

/** Busca un estilo por su carpeta, su nombre en español o en inglés, o un nombre corto. */
export function findFilmStyle(query: string): FilmStyle | undefined {
  const q = norm(query)
  if (!q) return undefined
  return (
    FILM_STYLES.find((s) => s.slug === q.replace(/ /g, '-')) ??
    FILM_STYLES.find((s) => norm(s.name) === q || norm(s.en) === q) ??
    FILM_STYLES.find((s) => (ALIASES[s.slug] ?? []).some((a) => a === q))
  )
}

/**
 * Quita «estilo X» del texto de una petición de vídeo y dice qué estilo era. Prueba de la frase más larga a la más
 * corta («estilo pixel rpg de 16 bits sobre…» → pixel-rpg, tema «sobre…»). «estilo:slug» también vale (lo pone el
 * selector de estilos de la app).
 */
export function takeFilmStyle(text: string): { style: FilmStyle; rest: string } | null {
  const tag = /(^|\s)estilo:([a-z0-9-]+)(?=\s|$)/i.exec(text)
  if (tag) {
    const style = filmStyle(tag[2].toLowerCase())
    if (style) return { style, rest: (text.slice(0, tag.index) + tag[1] + text.slice(tag.index + tag[0].length)).replace(/\s{2,}/g, ' ').trim() }
  }
  const m = /(^|[\s,])(?:(?:al|en|con|de)\s+)?(?:estilo|style)\s+(.+)$/i.exec(text)
  if (!m) return null
  const after = m[2].split(/\s+/)
  for (let n = Math.min(6, after.length); n >= 1; n--) {
    const style = findFilmStyle(after.slice(0, n).join(' '))
    if (style) {
      const rest = (text.slice(0, m.index) + m[1] + after.slice(n).join(' '))
        .replace(/^\s*[,:;]\s*/, '')
        .replace(/[\s,:;]+$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      return { style, rest }
    }
  }
  return null
}

// ---------- el selector del cuadro de texto ----------

const VIDEO_CMD = /^\/v[ií]deo(?=\s|$)/i

/** ¿Está escribiendo una petición «/video …»? */
export function isVideoCommand(text: string): boolean {
  return VIDEO_CMD.test(text.trimStart())
}
