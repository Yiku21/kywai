import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { calmClip, characterRole, parseSkin, pickClip } from './characters'

const base = { visual: 'idle' as const, speed: 0, checkAmt: 0, questionAmt: 0, eyeError: 0, ackAmt: 0, t: 0 }

describe('personajes 3D', () => {
  it('reconoce el personaje por el nombre o el id', () => {
    expect(characterRole('Claude claude')).toBe('claude')
    expect(characterRole('Aider cli-aider')).toBe('aider')
    expect(characterRole('Kilo CLI kilo')).toBe('kilo')
    expect(characterRole('Mi agente raro x1')).toBeUndefined()
  })

  it('elige el movimiento según lo que hace el agente', () => {
    expect(pickClip(base)).toBe('reposo')
    expect(pickClip({ ...base, visual: 'thinking' })).toBe('piensa')
    expect(pickClip({ ...base, visual: 'working', t: 1 })).toBe('explica')
    expect(pickClip({ ...base, visual: 'working', t: 8 })).toBe('habla')
    expect(pickClip({ ...base, visual: 'error' })).toBe('duda')
    expect(pickClip({ ...base, checkAmt: 0.9, visual: 'working' })).toBe('celebra')
    expect(pickClip({ ...base, ackAmt: 0.5 })).toBe('saluda')
    // El coordinador que te llama por «Te necesita» saluda aunque esté trabajando o dudando.
    expect(pickClip({ ...base, callAmt: 0.8, visual: 'working', t: 1 })).toBe('saluda')
    expect(pickClip({ ...base, callAmt: 0.8, visual: 'error' })).toBe('saluda')
    // Caminar manda sobre todo lo demás.
    expect(pickClip({ ...base, speed: 2, visual: 'error' })).toBe('camina')
    expect(pickClip({ ...base, speed: 2, callAmt: 1 })).toBe('camina')
  })

  it('recuerda el aspecto elegido', () => {
    expect(parseSkin('refugio')).toBe('refugio')
    expect(parseSkin('clasico')).toBe('clasico')
    expect(parseSkin(null)).toBe('personajes')
    expect(parseSkin('otro')).toBe('personajes')
  })

  it('calmClip acerca la cabeza a su postura media y deja igual lo que no toca', () => {
    const a = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.5)
    const b = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.5)
    const vals = [...a.toArray(), ...b.toArray()]
    const head = new THREE.QuaternionKeyframeTrack('Head.quaternion', [0, 1], vals)
    const arm = new THREE.QuaternionKeyframeTrack('LeftArm.quaternion', [0, 1], vals)
    const clip = new THREE.AnimationClip('reposo', 1, [head, arm])
    calmClip(clip, { head: 0.2, body: 1 })
    const first = new THREE.Quaternion().fromArray(Array.from(head.values), 0)
    expect(2 * Math.acos(Math.min(1, Math.abs(first.w)))).toBeCloseTo(0.1, 3)
    expect(Array.from(arm.values)).toEqual(vals.map((x) => Math.fround(x)))
  })
})
