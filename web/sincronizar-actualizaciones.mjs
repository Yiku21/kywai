// Pone al día web/actualizaciones.json: todos los cambios de kywai desde el primer día, para la página «Actualizaciones».
//   KYWAI_CODIGO=/ruta/al/codigo node --experimental-strip-types web/sincronizar-actualizaciones.mjs
// Fuentes (todas dentro del código de la app, que no vive en este repositorio):
//   · src/shared/notasDeParche/*.ts y patchNotesAnteriores.ts: las notas de parche, en 6 idiomas (desde el 20 nov 2026).
//   · CHANGELOG.md: el registro de octubre al 13 nov 2026 (solo en español).
//   · git log: los títulos de los cambios del 14 al 19 nov (solo en español; los títulos están escritos para el usuario).
// Lo de antes del 20 nov no cambia nunca: si el código no trae su historial (clon superficial), se conserva lo que ya hay.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SALIDA = join(AQUI, 'actualizaciones.json')
const CODIGO = process.env.KYWAI_CODIGO
if (!CODIGO || !existsSync(join(CODIGO, 'src/shared/patchNotes.ts'))) {
  console.error('Falta KYWAI_CODIGO (la carpeta del código de kywai)')
  process.exit(1)
}
const previo = existsSync(SALIDA) ? JSON.parse(readFileSync(SALIDA, 'utf8')) : { dias: [] }
const CORTE = '2026-11-20' // desde aquí hay notas de parche; antes, registro y títulos
const MESES = { octubre: 10, noviembre: 11 }
const dos = n => String(n).padStart(2, '0')

// 1. Notas de parche (6 idiomas).
const notas = []
const carpeta = join(CODIGO, 'src/shared/notasDeParche')
for (const archivo of readdirSync(carpeta).filter(f => f.endsWith('.ts'))) notas.push((await import(pathToFileURL(join(carpeta, archivo)))).default)
notas.push(...(await import(pathToFileURL(join(CODIGO, 'src/shared/patchNotesAnteriores.ts')))).NOTAS_ANTERIORES)
const TIPO = { destacado: 'd', mejora: 'm', arreglo: 'a' }
const porDia = new Map()
const poner = (fecha, entrada) => { if (!porDia.has(fecha)) porDia.set(fecha, []); porDia.get(fecha).push(entrada) }
const vistos = new Set()
for (const n of notas) {
  if (vistos.has(n.id)) throw Error('Nota repetida: ' + n.id)
  vistos.add(n.id)
  poner(n.fecha, { t: TIPO[n.tipo], ti: n.titulo, ...(n.texto ? { tx: n.texto } : {}), ...(n.solo ? { so: n.solo } : {}) })
}

// 2. Antes del corte: lo que ya había (si no se puede rehacer) o el registro + el historial de git.
const antiguo = new Map()
for (const dia of previo.dias) if (dia.f < CORTE) antiguo.set(dia.f, dia.n)
const registro = join(CODIGO, 'CHANGELOG.md')
if (existsSync(registro)) {
  let fecha = null
  const nuevo = new Map()
  for (const linea of readFileSync(registro, 'utf8').split('\n')) {
    const dia = /^#{2,3} (\d{1,2}) de (octubre|noviembre) de 2026/.exec(linea)
    if (dia) { fecha = `2026-${dos(MESES[dia[2]])}-${dos(dia[1])}`; continue }
    const punto = /^- (?:`v([\d.]+)` )?(.+)$/.exec(linea)
    if (!punto || !fecha) continue
    if (!nuevo.has(fecha)) nuevo.set(fecha, [])
    nuevo.get(fecha).push({ t: 'm', ti: { es: punto[2].trim() }, ...(punto[1] ? { v: punto[1] } : {}) })
  }
  for (const [f, n] of nuevo) antiguo.set(f, n)
}
try {
  const crudo = execFileSync('git', ['-C', CODIGO, 'log', '--since=2026-11-13T23:59:00', '--until=2026-11-20T00:00:00', '--no-merges', '--format=%ad\t%s', '--date=short'], { encoding: 'utf8', maxBuffer: 1 << 26 })
  const INTERNO = /^(\[skip\]|Merge|Revert|Pruebas?\b|Manual\b|Documentos?\b|Docs?\b|Revisión\b|AGENTS|Sincroniza)/i
  const nuevo = new Map()
  for (const linea of crudo.split('\n').filter(Boolean)) {
    const [fecha, ...resto] = linea.split('\t')
    const titulo = resto.join('\t').trim()
    if (!titulo || INTERNO.test(titulo) || fecha >= CORTE || fecha <= '2026-11-13') continue
    if (!nuevo.has(fecha)) nuevo.set(fecha, [])
    if (!nuevo.get(fecha).some(e => e.ti.es === titulo)) nuevo.get(fecha).push({ t: 'm', ti: { es: titulo } })
  }
  if (nuevo.size) for (const [f, n] of nuevo) antiguo.set(f, n)
} catch {
  console.warn('Sin historial de git: se conserva el del 14 al 19 de noviembre que ya había')
}
for (const [f, n] of antiguo) porDia.set(f, n)

// 3. Fuera: de la más nueva a la más vieja; dentro de cada día, primero lo destacado y al final los arreglos.
const ORDEN = { d: 0, m: 1, a: 2 }
const dias = [...porDia.keys()].sort().reverse().map(f => ({ f, n: porDia.get(f).map((e, i) => [e, i]).sort((a, b) => ORDEN[a[0].t] - ORDEN[b[0].t] || a[1] - b[1]).map(p => p[0]) }))
writeFileSync(SALIDA, JSON.stringify({ dias }) + '\n')
const total = dias.reduce((s, d) => s + d.n.length, 0)
console.log(`actualizaciones.json: ${total} cambios en ${dias.length} días (${dias.at(-1).f} → ${dias[0].f})`)
