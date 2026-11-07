import * as THREE from 'three'
import type { RobotBrain } from './robotBrain'
import type { RobotModel } from './robotModel'

const ERROR_EYE = new THREE.Color('#ff6b7a')
const OFF_EYE = new THREE.Color('#8a97ad')
const tmpColor = new THREE.Color()

function show(m: THREE.Mesh, w: number, sx: number, sy: number): void {
  m.visible = w > 0.01
  if (m.visible) m.scale.set(Math.max(0.001, sx), Math.max(0.001, sy), 1)
}

/**
 * Aplica la expresión del cerebro a los ojos del modelo: un mismo juego de formas para todos los robots
 * (redondo, «> <», párpado caído, rayita, «×» y arco feliz) que se funden entre sí por escala, más la apertura de
 * cada ojo, la mirada, la inclinación y el color. Solo toca escalas, posiciones y un color: no cuesta rendimiento.
 */
export function applyEyes(model: RobotModel, brain: RobotBrain, hover = 0): void {
  // Pesos por prioridad: feliz > error > dormido/apagado > esfuerzo > cansado > normal.
  let rem = 1
  const take = (v: number): number => {
    const w = Math.min(rem, Math.max(0, v))
    rem -= w
    return w
  }
  const wHappy = take(brain.eyeHappy)
  const wCross = take(brain.eyeError)
  const wFlat = take(Math.max(brain.offlineAmt * 0.9, brain.eyeSleep))
  const wChev = take(brain.eyeChevron)
  const wLid = take(brain.eyeTired)
  const wBase = rem
  const esAll = brain.eyeScale

  for (const e of model.eyes) {
    const open = e.side < 0 ? brain.eyeOpenL : brain.eyeOpenR
    // Guiño en este ojo: pasa a «>» o «<» quitándole peso a la forma normal.
    const wink = Math.max(0, brain.eyeWink * e.side)
    const wB = wBase * (1 - wink)
    const wC = wChev + wBase * wink
    const big = 1 + Math.max(0, brain.eyeBig * e.side) - Math.max(0, -brain.eyeBig * e.side) * 0.25
    const es = esAll * big
    e.group.position.x = e.x + brain.eyeLookX * 0.035 + brain.eyeShakeX
    e.group.position.y = e.y + brain.eyeLookY * 0.028 + wHappy * 0.01
    e.group.rotation.z = -e.side * brain.eyeTilt
    show(e.base, wB, wB * es, wB * open * es)
    // El párpado ya dice «cansado»: no se encoge otra vez por el cansancio, solo con parpadeos y bostezos.
    show(e.lid, wLid, wLid * es, wLid * Math.min(1.1, open * 1.7) * es)
    show(e.chevron, wC, wC * es, wC * Math.min(1.1, 0.35 + open * 0.75) * es)
    show(e.cross, wCross, wCross * es, wCross * es * Math.min(1, open / 0.4))
    show(e.flat, wFlat, wFlat, wFlat * (0.6 + 0.4 * Math.min(1, open)))
    show(e.happy, wHappy, wHappy * es, wHappy * es)
  }

  tmpColor.copy(model.eyeColor)
  if (brain.eyeError > 0.01) tmpColor.lerp(ERROR_EYE, brain.eyeError)
  // Apagado: rayitas grises pero visibles (antes los ojos casi desaparecían y el robot parecía «en negro»).
  if (brain.offlineAmt > 0.01) tmpColor.lerp(OFF_EYE, brain.offlineAmt * 0.6)
  const boost = 1.25 + brain.glow * 1.6 + hover * 0.4 - brain.restAmt * 0.3 - brain.eyeSleep * 0.3 - brain.fatigue * 0.15
  model.eyeMat.color.copy(tmpColor).multiplyScalar(Math.max(1.05, boost))
}
