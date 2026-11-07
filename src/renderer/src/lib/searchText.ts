/**
 * Texto del buscador en la interfaz: separar lo buscado en palabras y frases (igual que el motor) y marcar dónde
 * aparecen, sin distinguir mayúsculas ni tildes.
 */

/** Quita tildes y pasa a minúsculas sin cambiar la longitud (cada letra sigue en su sitio). */
export function fold(s: string): string {
  return Array.from(s, (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c).join('')
}

/** Palabras sueltas y «frases entre comillas», normalizadas (la misma regla que parseQuery del motor). */
export function searchTerms(raw: string): string[] {
  const text = fold(raw).slice(0, 200)
  const terms: string[] = []
  const rest = text.replace(/["“”«»]([^"“”«»]+)["“”«»]?/g, (_m, phrase: string) => {
    const p = phrase.replace(/\s+/g, ' ').trim()
    if (p) terms.push(p)
    return ' '
  })
  for (const w of rest.split(/\s+/)) {
    const word = w.replace(/^[.,;:¿?¡!()]+|[.,;:¿?¡!()]+$/g, '')
    if (word.length >= 2 || (word.length === 1 && /\d/.test(word))) terms.push(word)
  }
  return [...new Set(terms)]
}

/** Dónde aparece cada término en el texto: tramos [inicio, fin) ordenados y sin solaparse. */
export function findRanges(text: string, terms: string[]): Array<[number, number]> {
  const folded = fold(text)
  const raw: Array<[number, number]> = []
  for (const t of terms) {
    if (!t) continue
    for (let i = folded.indexOf(t); i >= 0; i = folded.indexOf(t, i + t.length)) raw.push([i, i + t.length])
  }
  raw.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  const out: Array<[number, number]> = []
  for (const r of raw) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

/** Trozos de un texto con lo buscado marcado (para pintar <mark>). */
export function highlight(text: string, query: string | string[]): Array<{ text: string; hit: boolean }> {
  const terms = Array.isArray(query) ? query : searchTerms(query)
  const ranges = findRanges(text, terms)
  if (!ranges.length) return [{ text, hit: false }]
  const out: Array<{ text: string; hit: boolean }> = []
  let from = 0
  for (const [a, b] of ranges) {
    if (a > from) out.push({ text: text.slice(from, a), hit: false })
    out.push({ text: text.slice(a, b), hit: true })
    from = b
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false })
  return out
}

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void }

/**
 * Resalta lo buscado dentro de un elemento ya pintado (el mensaje al que se salta) con la API de resaltado de CSS,
 * sin tocar el DOM. Donde no exista esa API no hace nada. Devuelve cómo quitarlo.
 */
export function markInElement(el: HTMLElement, terms: string[], name = 'cowork-search'): () => void {
  const reg = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights
  const Ctor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  if (!reg || !Ctor || !terms.length) return () => undefined
  const ranges: Range[] = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    for (const [a, b] of findRanges(text, terms)) {
      const r = document.createRange()
      r.setStart(node, a)
      r.setEnd(node, b)
      ranges.push(r)
    }
  }
  reg.set(name, new Ctor(...ranges))
  return () => reg.delete(name)
}
