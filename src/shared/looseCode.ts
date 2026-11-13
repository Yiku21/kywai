/**
 * JSON escrito suelto dentro de una frase («pega esto: { "Action": "*", "Resource": "*" }»).
 *
 * El Markdown se come sus `*` y `_` como cursiva, así que al copiarlo sale una política rota. Antes de pintar el
 * mensaje, cada objeto (o lista) JSON válido que esté fuera de un bloque de código se saca a su propia tarjeta
 * ```json, con el botón de copiar, dentro del mismo punto de la lista si lo había. Lo que no es JSON válido (o
 * está ya entre comillas invertidas) se deja como está.
 */

/** Más corto que esto no merece tarjeta propia («[1]», «{}»…). */
const MIN_LENGTH = 15

const FENCE = /^\s{0,3}(?:>\s?)*\s{0,3}(`{3,}|~{3,})/
const QUOTE = /^(\s{0,3}(?:>\s?)+)/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)/

/** Dónde acaba el valor JSON que empieza en `start` (sus llaves y corchetes cuadran), o -1. */
function balancedEnd(text: string, start: number): number {
  const stack: string[] = []
  let inString = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      else if (ch === '\n') return -1
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return -1
      if (stack.length === 0) return i + 1
    } else if (ch === '\n' && text[i + 1] === '\n') return -1 // una línea en blanco: se acabó el párrafo
  }
  return -1
}

/** Si el trozo es un objeto o una lista JSON que vale la pena sacar a una tarjeta. */
function isLooseJson(raw: string): boolean {
  if (raw.length < MIN_LENGTH || !raw.includes('"')) return false
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return false
  }
  if (Array.isArray(value)) return value.length > 0 && value.some((v) => typeof v === 'string' || (typeof v === 'object' && v !== null))
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0
}

/** El texto del JSON listo para la tarjeta: ordenado en varias líneas si venía en una sola. */
function pretty(raw: string): string[] {
  if (raw.includes('\n')) {
    const lines = raw.split('\n')
    const rest = lines.slice(1).filter((l) => l.trim())
    const common = rest.length ? Math.min(...rest.map((l) => l.match(/^\s*/)![0].length)) : 0
    // La primera línea empieza en «{»; las demás pierden la sangría que traían de la lista.
    return [lines[0].trim(), ...lines.slice(1).map((l) => l.slice(Math.min(common, l.match(/^\s*/)![0].length)))].map((l) => l.trimEnd())
  }
  // Números enormes: JSON.parse los redondearía; mejor dejarlo en una línea tal cual.
  if (/\d{16,}/.test(raw)) return [raw]
  return JSON.stringify(JSON.parse(raw), null, 2).split('\n')
}

/** Lo que debe ir delante de cada línea nueva para seguir dentro de la misma cita y el mismo punto de la lista. */
function continuation(lines: string[], lineIndex: number): string {
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i]
    if (!line.trim()) break
    const quote = line.match(QUOTE)?.[1] ?? ''
    const body = line.slice(quote.length)
    const item = body.match(LIST_ITEM)
    if (item) return (quote ? `${quote.trimEnd()} ` : '') + ' '.repeat(item[0].length)
    if (i === 0 || !lines[i - 1].trim()) return quote ? `${quote.trimEnd()} ` : ''
  }
  const quote = lines[lineIndex]?.match(QUOTE)?.[1]
  return quote ? `${quote.trimEnd()} ` : ''
}

/** Salta un `código en línea` que empieza en `i` (una tira de comillas invertidas). Devuelve dónde sigue el texto. */
function skipInlineCode(text: string, i: number): number {
  let n = 0
  while (text[i + n] === '`') n++
  const close = text.indexOf('`'.repeat(n), i + n)
  if (close < 0) return i + n
  let end = close
  while (text[end] === '`') end++
  return end - close === n ? end : i + n
}

/** Saca a tarjetas ```json el JSON suelto de un trozo de texto sin bloques de código. */
function fenceSegment(segment: string): string {
  let out = ''
  let from = 0
  let i = 0
  while (i < segment.length) {
    const ch = segment[i]
    if (ch === '`') {
      i = skipInlineCode(segment, i)
      continue
    }
    if (ch !== '{' && ch !== '[') {
      i++
      continue
    }
    const lineStart = segment.lastIndexOf('\n', i - 1) + 1
    const firstOnLine = segment.slice(lineStart, i)
    // Las filas de una tabla y los títulos se quedan como están.
    if (/^\s*\|/.test(firstOnLine) || /^\s{0,3}#/.test(firstOnLine)) {
      i++
      continue
    }
    const end = balancedEnd(segment, i)
    const raw = end > 0 ? segment.slice(i, end) : ''
    if (!raw || !isLooseJson(raw)) {
      i++
      continue
    }
    const all = segment.split('\n')
    const lineIndex = segment.slice(0, i).split('\n').length - 1
    const prefix = continuation(all, lineIndex)
    const before = segment.slice(from, i).replace(/[ \t]+$/, '')
    const block = ['```json', ...pretty(raw), '```'].map((l) => (l ? prefix + l : prefix.trimEnd())).join('\n')
    const gap = `\n${prefix.trimEnd()}\n` // línea en blanco que no saca de la cita
    out += `${before}${before.trim() ? gap : ''}${block}`
    // Lo que sigue en la misma línea («, y pulsa Next») pasa a su propio párrafo dentro del mismo punto.
    const restOfLineEnd = segment.indexOf('\n', end)
    const restOfLine = segment.slice(end, restOfLineEnd < 0 ? segment.length : restOfLineEnd)
    if (restOfLine.trim()) {
      const tail = restOfLine.trim().replace(/^[,;:]\s*/, '')
      if (tail.replace(/[.,;:]/g, '').trim()) out += `${gap}${prefix}${tail}`
    }
    from = restOfLineEnd < 0 ? segment.length : restOfLineEnd
    // Tras la tarjeta hace falta una línea en blanco para que lo siguiente no quede pegado.
    if (restOfLineEnd >= 0 && segment[restOfLineEnd + 1] !== '\n' && segment.slice(restOfLineEnd + 1).trim()) {
      out += '\n'
    }
    i = from
  }
  return out + segment.slice(from)
}

/** El mensaje con su JSON suelto sacado a tarjetas copiables. Los bloques de código ya escritos no se tocan. */
export function fenceLooseJson(text: string): string {
  if (!text || (!text.includes('{') && !text.includes('['))) return text
  const lines = text.split('\n')
  const parts: string[] = []
  let plain: string[] = []
  let fence: { char: string; size: number } | null = null
  let code: string[] = []
  for (const line of lines) {
    const m = line.match(FENCE)
    if (fence) {
      code.push(line)
      if (m && m[1][0] === fence.char && m[1].length >= fence.size && !line.slice(line.indexOf(m[1]) + m[1].length).trim()) {
        parts.push(code.join('\n'))
        code = []
        fence = null
      }
      continue
    }
    if (m) {
      if (plain.length) parts.push(fenceSegment(plain.join('\n')))
      plain = []
      fence = { char: m[1][0], size: m[1].length }
      code = [line]
      continue
    }
    plain.push(line)
  }
  if (fence) parts.push(code.join('\n')) // bloque sin cerrar (aún llegando): tal cual
  else if (plain.length) parts.push(fenceSegment(plain.join('\n')))
  return parts.join('\n')
}
