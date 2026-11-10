import type { AgentConfig, StationConfig } from '@shared/types'
import { isTempStation } from '@shared/tempStations'

/**
 * Colocación ordenada de los puestos (solo visual: la configuración guardada no cambia).
 *
 * Los agentes forman un polígono regular alrededor del núcleo, todos a la misma distancia entre sí: 3 puestos son un
 * triángulo, 4 un cuadrado, 5 un pentágono… El puesto fijo del becario («Apoyo») cuenta siempre como un vértice,
 * aunque esté vacío. Los demás puestos vacíos no se dibujan. Hermes va delante (hacia la cámara) y el becario al
 * fondo a la derecha; el resto sigue el orden en el que estaban alrededor del núcleo.
 *
 * Los becarios de más (puestos temporales, src/shared/tempStations.ts) no ocupan vértice: salen pegados al becario
 * original, como una extensión de su puesto hacia fuera (1, luego 2, luego 3 por fila).
 */

/** Distancia entre los centros de dos puestos vecinos del polígono. */
export const POLYGON_SIDE = 4.3
/** Radio mínimo: con pocos agentes el polígono no se pega al núcleo. */
export const POLYGON_MIN_RADIUS = 6.2
/** Hasta este radio el polígono cabe entre el núcleo y las zonas de los lados (tareas, archivos, herramientas, memoria). */
const INNER_MAX_RADIUS = 7
/** Con más agentes de los que caben dentro, el polígono rodea también las zonas. */
const OUTER_RADIUS = 13.4
/** Separación entre el becario y sus extensiones (y entre ellas). */
export const EXTENSION_GAP = 3.9

/** Radio del polígono regular de `n` vértices con lado POLYGON_SIDE. */
export function polygonRadius(n: number): number {
  const r = n < 3 ? POLYGON_MIN_RADIUS : Math.max(POLYGON_MIN_RADIUS, POLYGON_SIDE / (2 * Math.sin(Math.PI / n)))
  return r <= INNER_MAX_RADIUS ? r : Math.max(OUTER_RADIUS, r)
}

/** Ángulo alrededor del núcleo (0 = delante, hacia la cámara; crece hacia la derecha). */
const angleOf = ([x, z]: [number, number]): number => {
  const a = Math.atan2(x, z)
  return a < 0 ? a + Math.PI * 2 : a
}

const round = (v: number): number => Math.round(v * 1000) / 1000

export function polygonLayout(stations: StationConfig[], agents: Record<string, AgentConfig> | AgentConfig[]): StationConfig[] {
  const list = Array.isArray(agents) ? agents : Object.values(agents)
  const occupied = new Set(list.map((a) => a.stationId))
  const fixed = stations.filter((s) => !isTempStation(s.id))
  const intern = fixed.find((s) => s.forSubagents)
  const hermesStation = list.find((a) => a.provider === 'hermes' && !a.isSubagent)?.stationId

  // Vértices: los puestos con agente y siempre el del becario.
  const vertices = fixed.filter((s) => occupied.has(s.id) || s === intern)
  const n = vertices.length
  if (!n) return stations.filter((s) => isTempStation(s.id) && occupied.has(s.id))

  const hermes = vertices.find((s) => s.id === hermesStation)
  const rest = vertices.filter((s) => s !== hermes && s !== intern).sort((a, b) => angleOf(a.position) - angleOf(b.position))
  const slots: (StationConfig | undefined)[] = new Array(n).fill(undefined)
  if (hermes) slots[0] = hermes
  if (intern) {
    // Al fondo a la derecha (ángulo π − π/n): nunca justo detrás del núcleo, que lo taparía.
    const back = n <= 2 ? n - 1 : Math.ceil(n / 2) - 1
    slots[slots[back] ? slots.findIndex((s) => !s) : back] = intern
  }
  for (const s of rest) slots[slots.findIndex((x) => !x)] = s

  const radius = polygonRadius(n)
  // Con un número par de lados se gira medio paso: el cuadrado sale «recto» y no queda ningún puesto escondido justo
  // detrás del núcleo. Con un número impar, un vértice mira a la cámara y el fondo es un lado.
  const turn = n % 2 === 0 ? Math.PI / n : 0
  const placed = new Map<string, [number, number]>()
  slots.forEach((s, k) => {
    if (!s) return
    const a = turn + (k / n) * Math.PI * 2
    placed.set(s.id, [round(Math.sin(a) * radius), round(Math.cos(a) * radius)])
  })

  // Becarios de más: filas que se abren hacia fuera desde el becario original (1, 2, 3…), siempre pegadas a él.
  const temps = stations
    .filter((s) => isTempStation(s.id) && occupied.has(s.id))
    .sort((a, b) => (Number(a.id.replace(/\D+/g, '')) || 0) - (Number(b.id.replace(/\D+/g, '')) || 0))
  if (temps.length) {
    const base = intern ? placed.get(intern.id)! : ([0, -radius] as [number, number])
    // Hacia fuera del núcleo y un poco hacia el fondo, para no tapar a los demás ni acercarse a la cámara.
    let ux = base[0] / radius
    let uz = base[1] / radius - 0.6
    const len = Math.hypot(ux, uz) || 1
    ux /= len
    uz /= len
    const vx = -uz
    const vz = ux
    let row = 1
    let inRow = 0
    for (const t of temps) {
      if (inRow === row) {
        row++
        inRow = 0
      }
      const along = EXTENSION_GAP + (row - 1) * EXTENSION_GAP * Math.sqrt(3) / 2
      const side = (inRow - (row - 1) / 2) * EXTENSION_GAP
      placed.set(t.id, [round(base[0] + ux * along + vx * side), round(base[1] + uz * along + vz * side)])
      inRow++
    }
  }

  return stations.filter((s) => placed.has(s.id)).map((s) => ({ ...s, position: placed.get(s.id)! }))
}
