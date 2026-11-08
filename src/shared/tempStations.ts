import type { AgentConfig, StationConfig } from './types'

/**
 * Puestos temporales para becarios. Siempre hay un puesto de apoyo fijo («Apoyo», `forSubagents`); si está ocupado
 * y otro agente necesita un becario, el motor le da un puesto temporal (`st-sub-tmp-1`, `-2`…) que no está en la
 * configuración. El 3D lo dibuja mientras haya un becario en él y desaparece cuando el becario se va.
 * Los sitios son los mismos que los puestos de reserva de Órbita (SpaceLayout.extraStation), al fondo del mapa.
 */
export const TEMP_STATION_PREFIX = 'st-sub-tmp-'

const SPOTS: [number, number][] = [
  [-3.6, -9.2],
  [6.6, -8.2],
  [-9.4, -6.6],
  [9.4, -6.6],
  [0, -12.4],
  [-7, -11.4],
  [7, -11.4]
]

/** Como mucho tantos becarios a la vez en puestos temporales (además del fijo). */
export const MAX_TEMP_STATIONS = 6

export function isTempStation(id: string | undefined): boolean {
  return !!id && id.startsWith(TEMP_STATION_PREFIX)
}

export function tempStationId(n: number): string {
  return `${TEMP_STATION_PREFIX}${n}`
}

/** Sitio del puesto temporal número n (desde 1), lejos de los puestos configurados. */
export function tempStationPosition(n: number, stations: StationConfig[]): [number, number] {
  const free = SPOTS.filter(([x, z]) => stations.every((s) => Math.hypot(s.position[0] - x, s.position[1] - z) >= 2.6))
  const spot = free[n - 1]
  if (spot) return [spot[0], spot[1]]
  // Más allá: un arco al fondo.
  const k = n - 1 - free.length
  const a = ((k % 9) - 4) * 0.28
  const r = 15 + Math.floor(k / 9) * 3.4
  return [r * Math.sin(a), -r * Math.cos(a)]
}

/** Los puestos configurados más los temporales que ocupan ahora los becarios. */
export function withTempStations(stations: StationConfig[], agents: Record<string, AgentConfig> | AgentConfig[]): StationConfig[] {
  const list = Array.isArray(agents) ? agents : Object.values(agents)
  const ids = [...new Set(list.map((a) => a.stationId).filter((id) => isTempStation(id) && !stations.some((s) => s.id === id)))]
  if (!ids.length) return stations
  const extra = ids
    .map((id) => ({ id, n: Number(id.slice(TEMP_STATION_PREFIX.length)) || 1 }))
    .sort((a, b) => a.n - b.n)
    .map(({ id, n }) => ({ id, label: 'Apoyo', position: tempStationPosition(n, stations), forSubagents: true }))
  return [...stations, ...extra]
}
