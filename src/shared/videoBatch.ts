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
  const lines = text
    .split("\n")
    .map((l) => ITEM_RE.exec(l)?.[1].trim())
    .filter((x): x is string => !!x);
  const ideas = lines.length >= 2 ? lines : inlineIdeas(text);
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
  if (!count && ideas.length >= 2) count = ideas.length;
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
