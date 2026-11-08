import type { AgentConfig, StationConfig } from '@shared/types'

export type HomeRole = 'claude' | 'gemini' | 'qwen' | 'aider' | 'kilo' | 'muse' | 'copilot' | 'codex' | 'hermes'
export const HOME_SPOTS: Record<HomeRole, [number, number]> = {
  claude: [-10.4, 7], gemini: [-11.2, .4], qwen: [-8.2, -6.4], aider: [-4.5, -10],
  kilo: [4.5, -10], muse: [8.2, -6.4], copilot: [11.2, .4], codex: [10.4, 7], hermes: [2, -2.2]
}
export function homeSlot(position:StationConfig['position']):HomeRole|undefined {
  return (Object.keys(HOME_SPOTS) as HomeRole[]).find(r=>Math.hypot(position[0]-HOME_SPOTS[r][0],position[1]-HOME_SPOTS[r][1])<.1)
}
export function homeRole(name: string): HomeRole | undefined {
  const n = name.toLowerCase()
  return (Object.keys(HOME_SPOTS) as HomeRole[]).find(role => n.includes(role))
}

/** Visual layout only: IDs, providers and persisted station positions are never changed. */
export function homeLayout(stations: StationConfig[], agents: Record<string, AgentConfig>): StationConfig[] {
  const roles = new Map<string, HomeRole>()
  const used = new Set<HomeRole>()
  for (const a of Object.values(agents)) {
    const role = homeRole(`${a.name} ${a.id}`)
    if (role && !used.has(role) && stations.some(s => s.id === a.stationId)) { roles.set(a.stationId, role); used.add(role) }
  }
  const free = (Object.keys(HOME_SPOTS) as HomeRole[]).filter(r => !used.has(r) && r !== 'hermes')
  return stations.map((s, i) => {
    const role = roles.get(s.id) ?? free.shift()
    // Extra custom stations remain usable, rather than being silently dropped or overlapped.
    return { ...s, position: role ? [...HOME_SPOTS[role]] : [-13 + (i % 6) * 5.2, 12 + Math.floor(i / 6) * 3.5] }
  })
}
