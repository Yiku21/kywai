/** A compressed visual orbit, not an astronomical ephemeris. The work surface stays in its local frame. */
export const ORBIT_SECONDS = 240
export const TAU = Math.PI * 2
export const orbitFrame = { angle: 0, cloudTime: 0, pitch: 0 }
export const SUN_OFFSET = -2.55

export function advanceOrbit(angle: number, delta: number, stopped: boolean): number {
  if (stopped || !Number.isFinite(delta) || delta <= 0) return angle
  return (angle + Math.min(delta, 0.1) * TAU / ORBIT_SECONDS) % TAU
}

export function celestialPosition(angle: number, offset: number, distance: number, elevation: number): [number, number, number] {
  return [Math.sin(offset - angle) * distance - 5, elevation, -Math.cos(offset - angle) * distance - 12]
}

export function sunDirection(angle: number): [number, number, number] {
  const y = 0.26, z = -Math.cos(SUN_OFFSET - angle), p = orbitFrame.pitch
  return [Math.sin(SUN_OFFSET - angle), y * Math.cos(p) - z * Math.sin(p), y * Math.sin(p) + z * Math.cos(p)]
}
