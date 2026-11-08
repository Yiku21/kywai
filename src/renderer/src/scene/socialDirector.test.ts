import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { AgentActivity } from '@shared/types'
import { RobotBrain } from './robotBrain'
import { PERSONAS } from './personality'
import { SocialLife, socialRoute, type SocialEvent } from './socialDirector'

const camera = new THREE.Vector3(0, 15, 25)
function brain(id: string, x: number, z: number, activity: AgentActivity = 'idle') {
  const result = new RobotBrain(id)
  result.home.set(x, 1.55, z); result.bay.set(0, 1.55, 2)
  result.persona = PERSONAS.boss
  result.setInputs(activity, 'station', null, 0)
  result.update(0, 0.1, camera)
  return result
}
function pair() {
  const a = brain('a', -6, 1), b = brain('b', -6, -5)
  return { a, b, brains: new Map([['a', a], ['b', b]]), life: new SocialLife() }
}
function step(life: SocialLife, brains: Map<string, RobotBrain>, t: number, reduced = false) {
  life.update(t, brains, reduced)
  for (const b of brains.values()) b.update(t, 0.1, camera)
}

describe('vida social de los agentes libres', () => {
  it('juegan entre ellos sin cambiar sus estados reales ni simular trabajo terminado', () => {
    const { a, b, brains, life } = pair()
    const busy = brain('busy', 6, 1, 'working'); brains.set('busy', busy)
    const events: SocialEvent[] = []; life.onEvent = (_, event) => events.push(event)
    const saved = [a.home.clone(), b.home.clone()]
    step(life, brains, 5)
    expect(life.active?.kind).toBe('catch')
    expect(life.active?.actors.map(b => b.agentId)).toEqual(['a', 'b'])
    expect(busy.social).toBeNull()
    step(life, brains, 7)
    expect(life.toy.visible).toBe(true)
    const start = life.toy.position.clone()
    step(life, brains, 8)
    expect(life.toy.position.distanceTo(start)).toBeGreaterThan(1)
    for (let t = 8.1; t < 22.9; t += 0.1) step(life, brains, t)
    expect(events.filter(e => e === 'invite')).toHaveLength(1)
    expect(events.filter(e => e === 'caught')).toHaveLength(1)
    expect([a.activity, b.activity, busy.activity]).toEqual(['idle', 'idle', 'working'])
    expect(a.checkAmt).toBe(0); expect(b.checkAmt).toBe(0)
    expect([a.home, b.home]).toEqual(saved)
  })

  it.each(['working', 'thinking', 'waiting', 'error', 'offline'] as AgentActivity[])('interrumpe inmediatamente el juego si un participante pasa a %s', activity => {
    const { a, b, brains, life } = pair()
    step(life, brains, 5); step(life, brains, 7)
    a.setInputs(activity, 'station', null, 7)
    step(life, brains, 7.1)
    expect(life.active).toBeNull(); expect(life.toy.visible).toBe(false)
    expect(a.social).toBeNull(); expect(b.social).toBeNull()
    expect(a.visual).toBe(activity)
  })

  it.each(['typing', 'send', 'receive', 'leaving', 'core', 'removed', 'layout'])('da prioridad a %s y libera también al compañero', reason => {
    const { a, b, brains, life } = pair()
    step(life, brains, 5)
    if (reason === 'typing') a.onUserTyping(6)
    if (reason === 'send') a.onSend(b.home, 6)
    if (reason === 'receive') a.onExpect(b.home, 6, 8)
    if (reason === 'leaving') a.leave(6)
    if (reason === 'core') a.setInputs('idle', 'core', null, 6)
    if (reason === 'removed') brains.delete('a')
    if (reason === 'layout') a.home.x += 1
    step(life, brains, 6.1)
    expect(life.active).toBeNull(); expect(a.social).toBeNull(); expect(b.social).toBeNull()
  })

  it('un compañero visita al dormido, le da un susto y vuelve a su puesto', () => {
    const { a, b, brains, life } = pair()
    b.persona = PERSONAS.lazy
    for (let t = 0; t < 100; t += 0.1) for (const actor of brains.values()) actor.update(t, 0.1, camera)
    expect(b.eyeSleep).toBeGreaterThan(0.55)
    const events: SocialEvent[] = []; life.onEvent = (_, event) => events.push(event)
    step(life, brains, 100)
    expect(life.active?.kind).toBe('wake')
    for (let t = 100.1; t < 105; t += 0.1) step(life, brains, t)
    expect(a.pos.distanceTo(a.home)).toBeGreaterThan(1)
    expect(b.visual).toBe('resting')
    for (let t = 105; t < 108; t += 0.1) step(life, brains, t)
    expect(b.visual).toBe('idle'); expect(b.eyeSleep).toBeLessThan(0.1)
    expect(events).toEqual(['boo', 'startled', 'laugh'])
    for (let t = 108; t <= 116; t += 0.1) step(life, brains, t)
    expect(a.pos.clone().setY(a.home.y).distanceTo(a.home)).toBeLessThan(0.1)
    expect(a.social).toBeNull(); expect(b.social).toBeNull()
  })

  it('reducir efectos detiene las interacciones y oculta el juguete', () => {
    const { a, b, brains, life } = pair()
    step(life, brains, 5); step(life, brains, 7)
    step(life, brains, 7.1, true)
    expect(life.active).toBeNull(); expect(life.toy.visible).toBe(false)
    expect(a.social).toBeNull(); expect(b.social).toBeNull()
    step(life, brains, 100, true)
    expect(life.active).toBeNull()
  })

  it('no inicia escenas si solo queda un agente libre', () => {
    const { b, brains, life } = pair()
    b.setInputs('thinking', 'station', null, 4)
    step(life, brains, 5)
    expect(life.active).toBeNull()
  })

  it('reparte los turnos entre compañeros y alterna juguetes y visitas', () => {
    const { brains, life } = pair()
    for (const [id, x, z] of [['c', 6, 1], ['d', 6, -5], ['e', -6, 7], ['f', 6, 7]] as const) brains.set(id, brain(id, x, z))
    step(life, brains, 5)
    const first = life.active!.actors.map(b => b.agentId)
    expect(life.toy.kind).toBe('document')
    step(life, brains, 23); step(life, brains, 27)
    expect(life.active!.actors.every(b => !first.includes(b.agentId))).toBe(true)
    expect(life.toy.kind).toBe('browser')
    step(life, brains, 45); step(life, brains, 49)
    expect(life.active!.kind).toBe('greet')
  })

  it('al cancelar una visita vuelve suavemente sin retrasar el trabajo', () => {
    const { a, b, brains, life } = pair()
    b.eyeSleep = 1
    step(life, brains, 5)
    for (let t = 5.1; t <= 10; t += 0.1) step(life, brains, t)
    expect(a.pos.distanceTo(a.home)).toBeGreaterThan(1)
    const before = a.pos.clone()
    a.setInputs('working', 'station', null, 10)
    step(life, brains, 10.1)
    expect(a.visual).toBe('working')
    expect(a.pos.distanceTo(before)).toBeLessThan(before.distanceTo(a.home))
    for (let t = 10.2; t < 12; t += 0.1) step(life, brains, t)
    expect(a.pos.clone().setY(a.home.y).distanceTo(a.home)).toBeLessThan(0.01)
  })

  it('las visitas rodean el núcleo y respetan los extremos del camino', () => {
    const from = new THREE.Vector3(-6, 2, 0), to = new THREE.Vector3(6, 2, 0), out = new THREE.Vector3()
    socialRoute(from, to, 0, out); expect(out.distanceTo(from)).toBeLessThan(0.0001)
    socialRoute(from, to, 1, out); expect(out.distanceTo(to)).toBeLessThan(0.0001)
    for (let p = 0; p <= 1; p += 0.01) {
      socialRoute(from, to, p, out)
      expect(Math.hypot(out.x, out.z)).toBeGreaterThanOrEqual(6)
      expect(out.toArray().every(Number.isFinite)).toBe(true)
    }
  })

  it('las expresiones sociales se estabilizan sin acumular giros por fotograma', () => {
    const { a, b } = pair()
    a.social = { position: a.home.clone(), lookAt: b.home.clone(), awake: true, happy: 1, surprise: 0, bounce: 0, tilt: 0.15 }
    for (let frame = 0; frame < 600; frame++) a.update(5 + frame / 60, 1 / 60, camera)
    expect(Math.abs(a.roll)).toBeLessThan(0.3)
    expect(a.eyeHappy).toBeGreaterThan(0.9)
  })
})
