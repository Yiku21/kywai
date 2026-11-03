// Archivos de cada tarea: el coordinador dice qué puede crear o modificar cada una ("files" en el plan) y, al
// terminar, se comprueba qué cambió de verdad. Lo que quede fuera se avisa en el chat (no se deshace).

/** Ruta o carpeta normalizada: barras «/», sin «./» ni «/» delante. null si no es una ruta razonable. */
export function normalizeScopePath(p: string): string | null {
  let s = p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  s = s.replace(/\/{2,}/g, '/')
  if (!s || s === '.' || s.length > 200 || s.split('/').includes('..') || /^[a-z]:/i.test(s)) return null
  return s
}

/** "files" de una tarea del plan → lista limpia (como mucho 20). */
export function normalizeScope(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const p = normalizeScopePath(item)
    if (p && !out.includes(p)) out.push(p)
    if (out.length >= 20) break
  }
  return out
}

function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i')
}

/** El archivo (ruta relativa) está dentro de alguno de los patrones: archivo exacto, carpeta o comodín. */
export function inScope(rel: string, patterns: string[]): boolean {
  const file = normalizeScopePath(rel)
  if (!file) return false
  const f = file.toLowerCase()
  return patterns.some((raw) => {
    const p = raw.toLowerCase()
    if (p.includes('*') || p.includes('?')) return globToRegExp(p).test(f)
    const dir = p.endsWith('/') ? p : `${p}/`
    return f === p.replace(/\/$/, '') || f.startsWith(dir)
  })
}

/** Siempre permitido: documentos de la app y copias del chat. */
const ALWAYS_OK = ['.ai-cowork/', 'historial/']

/** Archivos cambiados que no eran de esta tarea (vacío si la tarea no declaró sus archivos). */
export function outsideScope(changed: string[], patterns: string[]): string[] {
  if (!patterns.length) return []
  return changed.filter((rel) => !ALWAYS_OK.some((p) => rel.startsWith(p)) && !inScope(rel, patterns))
}
