import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { AgentActivity } from '@shared/types'
import { RobotBrain } from './robotBrain'
import { PERSONAS } from './personality'
import { SocialLife, socialRoute, type SocialEvent, type SocialKind } from './socialDirector'

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

function reach(kind: SocialKind, tired = false) {
  const setup = pair()
  if (tired) setup.b.fatigue = 0.8
  for (let t = 5; t < 350; t += 0.1) {
    step(setup.life, setup.brains, t)
    if (setup.life.active?.kind === kind) return { ...setup, start: setup.life.active.start }
  }
  throw new Error(`No apareció ${kind}`)
}

function advance(setup: ReturnType<typeof reach>, from: number, to: number) {
  for (let elapsed = from; elapsed <= to + 0.001; elapsed += 0.1) step(setup.life, setup.brains, setup.start + elapsed)
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
    expect(life.active!.kind).toBe('dance')
    step(life, brains, 45); step(life, brains, 49)
    expect(life.active!.kind).toBe('bump')
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

  it('los dos compañeros bailan con pasos y un giro sin salir de su plataforma', () => {
    const setup = reach('dance')
    const bounce = [0, 0], tilt = [0, 0]
    for (let elapsed = 0; elapsed <= 4; elapsed += 0.1) {
      step(setup.life, setup.brains, setup.start + elapsed)
      for (const [i, p] of setup.life.active!.poses.entries()) {
        bounce[i] = Math.max(bounce[i], p.bounce)
        tilt[i] = Math.max(tilt[i], Math.abs(p.tilt))
      }
    }
    for (const peak of bounce) expect(peak).toBeGreaterThan(0.2)
    for (const peak of tilt) expect(peak).toBeGreaterThan(0.15)
    advance(setup, 4.1, 10)
    for (const [i, p] of setup.life.active!.poses.entries()) {
      expect(Math.abs(p.turn!)).toBeCloseTo(Math.PI * 2)
      expect(p.position.clone().setY(setup.life.active!.homes[i].y).distanceTo(setup.life.active!.homes[i])).toBeLessThan(0.5)
    }
  })

  it('el compañero imita el gesto con retraso y devuelve el guiño', () => {
    const setup = reach('mirror')
    advance(setup, 0, 2.6)
    const [a, b] = setup.life.active!.poses
    expect(a.tilt * b.tilt).toBeLessThan(0)
    expect(Math.abs(Math.abs(a.tilt) - Math.abs(b.tilt))).toBeGreaterThan(0.04)
    advance(setup, 2.7, 6)
    expect(a.wink! * b.wink!).toBeLessThan(0)
  })

  it('se acercan para chocar antenas y aparece un destello sin solapar sus cuerpos', () => {
    const setup = reach('bump')
    advance(setup, 0, 5.6)
    const [a, b] = setup.life.active!.poses
    expect(a.position.distanceTo(b.position)).toBeGreaterThanOrEqual(2.1)
    expect(setup.life.toy.visible).toBe(true)
    expect(setup.life.toy.kind).toBe('spark')
    expect(setup.life.toy.scale).toBeGreaterThan(0.8)
    expect(a.happy).toBe(1); expect(b.happy).toBe(1)
  })

  it('dan ánimos al más cansado sin cambiar su cuota ni su cansancio real', () => {
    const setup = reach('encourage', true)
    expect(setup.life.active!.actors[1]).toBe(setup.b)
    advance(setup, 0, 5.3)
    expect(setup.life.toy.visible).toBe(true)
    expect(setup.life.toy.kind).toBe('heart')
    const before = setup.life.active!.poses[1].happy
    advance(setup, 5.4, 7)
    expect(setup.life.active!.poses[1].happy).toBeGreaterThan(before)
    expect(setup.b.fatigue).toBe(0.8)
    expect(setup.b.activity).toBe('idle')
  })

  it.each(['dance', 'mirror', 'bump', 'encourage'] as const)('cancela %s de inmediato cuando llega trabajo o se reducen los efectos', kind => {
    for (const reduced of [false, true]) {
      const setup = reach(kind)
      advance(setup, 0, 6)
      if (!reduced) setup.life.active!.actors[0].setInputs('working', 'station', null, setup.start + 6)
      step(setup.life, setup.brains, setup.start + 6.1, reduced)
      expect(setup.life.active).toBeNull()
      expect(setup.life.toy.visible).toBe(false)
      expect(setup.a.social).toBeNull(); expect(setup.b.social).toBeNull()
    }
  })

  it('las siestas no impiden que aparezca todo el repertorio nuevo', () => {
    const { brains, life } = pair()
    const kinds = new Set<SocialKind>()
    for (let t = 5; t < 210; t += 0.1) {
      for (const b of brains.values()) b.eyeSleep = 1
      step(life, brains, t)
      if (life.active) kinds.add(life.active.kind)
    }
    expect([...kinds]).toEqual(expect.arrayContaining(['wake', 'dance', 'bump', 'mirror', 'greet', 'encourage', 'catch']))
  })
})
