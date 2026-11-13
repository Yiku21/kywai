// Varios vídeos con un solo «/video»: «hazme 3 vídeos de…», «tres reels…», «varios vídeos…» o una lista «1) … 2) …».
// kywai crea una tarea por vídeo (de 2 a 12, como mucho 6 a la vez) y a cada una le dice cuál le toca y qué ángulo cuenta, para que no salgan
// iguales; se reparten entre los agentes libres y el usuario se encuentra todos al volver.

export const MAX_BATCH = 12;
/** Cuántos vídeos de una misma petición se hacen a la vez: con más, el resto espera a que acaben (por tandas). */
export const BATCH_AT_ONCE = 6;
/** «varios vídeos» sin número. */
const SEVERAL = 3;

const WORDS: Record<string, number> = {
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};
const PIECES =
  "(?:v[ií]deos|videos|reels|clips|shorts|tiktoks|piezas|pel[ií]culas|anuncios|promos)";
const COUNT_RE = new RegExp(
  `(?:^|[^\\p{L}\\d])(\\d{1,2}|dos|tres|cuatro|cinco|seis|two|three|four|five|six)\\s+(?:\\p{L}+\\s+)?${PIECES}(?![\\p{L}])`,
  "iu",
);
const SEVERAL_RE = new RegExp(
  `(?:^|[^\\p{L}])(?:varios|varias|several|multiple)\\s+(?:\\p{L}+\\s+)?${PIECES}(?![\\p{L}])`,
  "iu",
);
/** El número tiene que ir con una orden de crear («genérame 3 vídeos») o al principio, no en el tema («los 5 vídeos más vistos»). */
const ASK_RE =
  /(?:^|[^\p{L}])(?:cr[eé]a(?:me|r)?|haz(?:me)?|hacer|gen[eé]ra(?:me|r)?|prep[aá]ra(?:me|r)?|quiero|necesito|dame|m[oó]nta(?:me|r)?|make|create|generate|produce|give\s+me|i\s+want|need)(?:\s+\p{L}+){0,3}\s*$/iu;

/** Pide uno solo: «un vídeo», «1 reel», «a video»… (no «un vídeo por guion» ni «un vídeo de cada idea», que son varios). */
const ONE_RE = new RegExp(
  `(?:^|[^\\p{L}\\d])(?:un|una|1|one|a|an|single)\\s+(?:\\p{L}+\\s+)?(?:v[ií]deo|video|reel|clip|short|tiktok|pieza|pel[ií]cula|anuncio|promo)(?![\\p{L}])(?!\\s+(?:\\p{L}+\\s+)?(?:por|para\\s+cada|de\\s+cada|con\\s+cada|per|for\\s+each|each))`,
  "iu",
);

/**
 * El texto es un guion, no una lista de vídeos: Hermes a veces mete el guion entero en la orden «/video …» y sus
 * viñetas («- **Qué se dice:** …», «- **Texto en pantalla:** …», «## Escena 2») no son vídeos distintos.
 */
const SCRIPT_RE =
  /^\s*#{1,6}\s|\*\*[^*\n]{1,40}:\s*\*\*|\*\*[^*\n]{1,40}\*\*\s*:|(?:^|[^\p{L}])(?:qu[eé]\s+se\s+dice|texto\s+en\s+pantalla|voz\s+en\s+off|narraci[oó]n|gancho|escena\s+\d|plano\s+\d|on-?screen\s+text|voice-?over|scene\s+\d|hook)\s*:/imu;

/** Una línea de lista: «1) …», «2. …», «- …», «• …». */
const ITEM_RE = /^\s*(?:\d{1,2}\s*[).:-]|[-•*])\s+(.{3,})$/;

export interface VideoBatch {
  count: number;
  /** Las ideas que dio el usuario en una lista (una por vídeo), si las hay. */
  ideas: string[];
}

/** Una lista en la misma línea: «1) … 2) … 3) …», con los números seguidos desde 1. */
function inlineIdeas(text: string): string[] {
  const marks: RegExpMatchArray[] = [];
  for (const m of text.matchAll(/(?:^|\s)(\d{1,2})\)\s+/g))
    if (Number(m[1]) === marks.length + 1) marks.push(m);
  if (marks.length < 2) return [];
  return marks
    .map((m, i) =>
      text
        .slice(m.index! + m[0].length, marks[i + 1]?.index ?? text.length)
        .trim()
        .replace(/[\s,;]+$/, ""),
    )
    .filter((x) => x.length >= 3);
}

/** Cuántos vídeos pide el texto (null si es uno solo). */
export function videoBatchOf(text: string): VideoBatch | null {
  // Un guion entero: sus viñetas son partes del mismo vídeo; solo cuenta un número pedido («hazme 3 vídeos»).
  const script = SCRIPT_RE.test(text);
  const lines = script ? [] : text
    .split("\n")
    .map((l) => ITEM_RE.exec(l)?.[1].trim())
    .filter((x): x is string => !!x);
  const ideas = lines.length >= 2 ? lines : script ? [] : inlineIdeas(text);
  const asked = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(text);
    if (!m) return null;
    const before = text.slice(
      0,
      m.index + (m[0].length - m[0].trimStart().length),
    );
    return !before.trim() || ASK_RE.test(before.slice(-60)) ? m : null;
  };
  const m = asked(COUNT_RE);
  let count = m
    ? (WORDS[m[1].toLowerCase()] ?? Number(m[1]))
    : asked(SEVERAL_RE)
      ? SEVERAL
      : 0;
  // «Hazme un vídeo …» con una lista dentro: es uno solo (los puntos son lo que cuenta ese vídeo).
  if (!count && ideas.length >= 2 && !asked(ONE_RE)) count = ideas.length;
  if (count < 2) return null;
  count = Math.min(count, MAX_BATCH);
  return { count, ideas: ideas.length >= 2 ? ideas.slice(0, count) : [] };
}

/** Ángulos para que cada vídeo cuente algo distinto cuando el usuario no dio sus ideas. */
export const BATCH_ANGLES = [
  "presentarlo: qué es y por qué le importa a quien lo ve",
  "cómo funciona: una función o un proceso, paso a paso",
  "un caso real: alguien lo usa y consigue un resultado concreto",
  "antes y después: el problema sin esto y cómo cambia con esto",
  "trucos y detalles que poca gente conoce",
  "la gran idea: hacia dónde va y por qué merece la pena",
];

/** Lo que se añade al tema del vídeo `n` (desde 1) de `total`: cuál es, qué le toca y qué cuentan los demás. */
export function batchBrief(
  n: number,
  total: number,
  ideas: string[] = [],
): string {
  const pick = (i: number): string =>
    ideas[i - 1] ?? BATCH_ANGLES[(i - 1) % BATCH_ANGLES.length];
  const others = Array.from({ length: total }, (_, i) => i + 1)
    .filter((i) => i !== n)
    .map((i) => `${i}: ${pick(i)}`)
    .join("; ");
  return [
    `Este encargo es el vídeo ${n} de ${total} de la misma petición; los otros los hacen otras tareas a la vez. Haz SOLO este vídeo (uno).`,
    `Al tuyo le toca: ${pick(n)}.`,
    `Los demás cuentan: ${others}. No repitas su gancho ni su contenido: cada vídeo tiene que decir algo distinto y entenderse solo.`,
  ].join(" ");
}
