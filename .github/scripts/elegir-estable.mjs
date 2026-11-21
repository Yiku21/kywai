// Decide qué versión de escritorio pasa de Beta a Estable. Lo usa .github/workflows/promover-estable.yml.
//
// Las versiones salen primero como Beta («pre-release» en GitHub): cada mejora, en cuanto se fusiona. Una vez por
// semana, la más nueva que ya pasó las pruebas reales de la noche en kywai cloud se marca como Estable («latest»),
// que es la que reciben las apps que no han elegido Beta, la web y los instaladores de una línea.
//
// Las pruebas de la noche las hacen dos cuentas robot (entran, piden un chat, un archivo, una imagen y una voz) y
// el resultado sale en https://cuenta.kywai.app/pruebas.json: { ok, cuando, version }. «version» es la versión de
// la app que estaba desplegada cuando corrieron; lo que salió después aún no está probado.
//
// Sin dependencias, para poder probarlo con «node --test .github/scripts/elegir-estable.test.mjs».
import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** Entre una Estable y la siguiente (programada) pasan al menos 6 días y medio. */
export const SEMANA = 6.5 * 24 * 3600
/** Las pruebas de la noche valen si son de las últimas 36 horas. */
export const FRESCO = 36 * 3600

/** [mayor, menor, parche] de «v0.1.1160» o «0.1.1160»; null si no es una versión. */
export function numero(tag) {
  const m = /^v?(\d{1,4})\.(\d{1,4})\.(\d{1,7})$/.exec(String(tag ?? '').trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** < 0 si a es más vieja que b, 0 si son la misma, > 0 si a es más nueva. */
export function comparar(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/**
 * releases: [{ tag_name, prerelease, draft }] · estable: etiqueta de la Estable de ahora ('' si no hay)
 * pruebas: { ok, cuando, version } de cuenta.kywai.app (null si no respondió)
 * anterior: { version, cuando } de publicado/estable.json (null si aún no hubo ninguna)
 * ahora: segundos · pedida: versión pedida a mano ('' = la más nueva probada) · forzar: sin mirar las pruebas
 * programado: true si lo lanza el horario (solo entonces se respeta «una por semana»)
 * Devuelve { promover: 'v0.1.N' o '', motivo }.
 */
export function elegir({ releases, estable = '', pruebas = null, anterior = null, ahora, pedida = '', forzar = false, programado = false }) {
  const publicadas = (Array.isArray(releases) ? releases : [])
    .filter((r) => r && !r.draft && numero(r.tag_name))
    .map((r) => ({ tag: String(r.tag_name).trim(), n: numero(r.tag_name) }))
  const actual = numero(estable)
  const nada = (motivo) => ({ promover: '', motivo })

  if (programado && anterior && Number.isFinite(anterior.cuando) && ahora - anterior.cuando < SEMANA) {
    return nada(`Ya salió una Estable esta semana (${anterior.version}). La siguiente, cuando pasen 7 días.`)
  }

  let tope = null
  if (!forzar) {
    if (!pruebas || typeof pruebas !== 'object') return nada('No se pudo leer el resultado de las pruebas de la noche (cuenta.kywai.app/pruebas.json).')
    if (pruebas.ok !== true) return nada('Las pruebas reales de la última noche no están en verde: no se promueve nada.')
    if (!Number.isFinite(pruebas.cuando) || ahora - pruebas.cuando > FRESCO) return nada('Las pruebas en verde son de hace más de 36 horas: no cuentan como las de anoche.')
    tope = numero(pruebas.version)
    if (!tope) return nada('Las pruebas no dicen qué versión se probó: no se puede saber cuál es segura.')
  }

  if (pedida) {
    const quiere = numero(pedida)
    const hay = quiere && publicadas.find((r) => comparar(r.n, quiere) === 0)
    if (!hay) return nada(`La versión ${pedida} no está publicada.`)
    if (actual && comparar(quiere, actual) === 0) return nada(`La ${hay.tag} ya es la Estable.`)
    if (!forzar && actual && comparar(quiere, actual) < 0) return nada(`La ${hay.tag} es más vieja que la Estable de ahora (${estable}): para volver atrás, marca «forzar».`)
    if (tope && comparar(quiere, tope) > 0) return nada(`La ${hay.tag} es más nueva que la que pasó las pruebas (${pruebas.version}): aún no está probada.`)
    return { promover: hay.tag, motivo: forzar ? `Pedida a mano, sin mirar las pruebas: ${hay.tag}.` : `Pedida a mano y dentro de lo probado anoche: ${hay.tag}.` }
  }

  const candidatas = publicadas
    .filter((r) => (!actual || comparar(r.n, actual) > 0) && (!tope || comparar(r.n, tope) <= 0))
    .sort((a, b) => comparar(b.n, a.n))
  if (!candidatas.length) {
    return nada(tope ? `No hay ninguna versión nueva que ya esté probada (probado hasta la ${pruebas.version}; Estable de ahora: ${estable || 'ninguna'}).` : 'No hay ninguna versión más nueva que la Estable de ahora.')
  }
  const elegida = candidatas[0].tag
  return { promover: elegida, motivo: forzar ? `La más nueva publicada, sin mirar las pruebas: ${elegida}.` : `La más nueva que pasó las pruebas reales de anoche: ${elegida} (probado hasta la ${pruebas.version}).` }
}

function leer(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'))
  } catch {
    return null
  }
}

/** Las Releases llegan paginadas, un objeto por línea (gh api --paginate --jq '.[] | {…}'). */
function leerLineas(ruta) {
  try {
    return readFileSync(ruta, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = process.env
  const r = elegir({
    releases: leerLineas(env.RELEASES),
    estable: (env.ESTABLE ?? '').trim(),
    pruebas: leer(env.PRUEBAS),
    anterior: leer(env.ANTERIOR),
    ahora: Math.floor(Date.now() / 1000),
    pedida: (env.PEDIDA ?? '').trim(),
    forzar: env.FORZAR === 'true',
    programado: env.PROGRAMADO === 'true'
  })
  console.log(r.promover ? `Pasa a Estable: ${r.promover}` : 'No se promueve nada.')
  console.log(r.motivo)
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `promover=${r.promover}\n`)
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${r.promover ? `Pasa a Estable: ${r.promover}` : 'No se promueve nada'}\n\n${r.motivo}\n`)
}
