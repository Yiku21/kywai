import * as THREE from 'three'
import type { RobotBrain, SocialPose } from './robotBrain'
import { smootherstep } from './layout'

export type SocialKind = 'catch' | 'wake' | 'greet'
export type SocialEvent = 'invite' | 'caught' | 'boo' | 'startled' | 'laugh' | 'hello' | 'reply'
interface Scene {
  kind: SocialKind
  actors: [RobotBrain, RobotBrain]
  homes: [THREE.Vector3, THREE.Vector3]
  poses: [SocialPose, SocialPose]
  destination: THREE.Vector3
  start: number
  duration: number
  events: Set<string>
}

const pose = (home: THREE.Vector3): SocialPose => ({ position: home.clone(), lookAt: home.clone(), awake: true, happy: 0, surprise: 0, bounce: 0, tilt: 0 })

/** Sigue el borde del espacio, evitando cruzar el núcleo para visitar otra plataforma. */
export function socialRoute(from: THREE.Vector3, to: THREE.Vector3, progress: number, out: THREE.Vector3): void {
  const p = smootherstep(progress)
  const a = Math.atan2(from.x, from.z), b = Math.atan2(to.x, to.z)
  const angle = a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * p
  const radius = THREE.MathUtils.lerp(Math.hypot(from.x, from.z), Math.hypot(to.x, to.z), p) + Math.sin(Math.PI * p) * 0.5
  out.set(Math.sin(angle) * radius, THREE.MathUtils.lerp(from.y, to.y, p) + Math.sin(Math.PI * p) * 0.25, Math.cos(angle) * radius)
}

/** Director local de una escena breve cada vez: sin tareas, archivos ni llamadas a modelos. */
export class SocialLife {
  active: Scene | null = null
  onEvent: ((agentId: string, event: SocialEvent) => void) | null = null
  onCancel: ((agentId: string) => void) | null = null
  readonly toy = { visible: false, kind: 'document' as 'document' | 'browser', position: new THREE.Vector3(), rotation: 0, scale: 1 }
  private nextAt = 5
  private cycle = 0
  private lastUsed = new Map<string, number>()

  clear(): void {
    if (this.active) for (const brain of this.active.actors) {
      brain.social = null
      this.onCancel?.(brain.agentId)
    }
    this.active = null
    this.toy.visible = false
  }

  private emit(scene: Scene, key: string, at: number, elapsed: number, actor: number, event: SocialEvent): void {
    if (elapsed < at || scene.events.has(key)) return
    scene.events.add(key)
    this.onEvent?.(scene.actors[actor].agentId, event)
  }

  update(t: number, brains: ReadonlyMap<string, RobotBrain>, reduced: boolean): void {
    if (reduced) { this.clear(); this.nextAt = t + 5; return }
    let scene = this.active
    if (scene && (scene.actors.some((brain, i) => brains.get(brain.agentId) !== brain || !brain.canSocialize(t) || brain.home.distanceToSquared(scene!.homes[i]) > 0.01) || t >= scene.start + scene.duration)) {
      this.clear()
      this.nextAt = t + 4
      scene = null
    }
    if (!scene && t >= this.nextAt) {
      const available = [...brains.values()].filter(brain => brain.canSocialize(t) && t - (this.lastUsed.get(brain.agentId) ?? -100) > 20)
      available.sort((a, b) => (this.lastUsed.get(a.agentId) ?? -100) - (this.lastUsed.get(b.agentId) ?? -100) || b.persona.chatty - a.persona.chatty || a.agentId.localeCompare(b.agentId))
      const sleeping = available.find(brain => brain.eyeSleep > 0.55)
      const first = available.find(brain => brain !== sleeping && brain.eyeSleep < 0.55) ?? available.find(brain => brain !== sleeping)
      if (!first) { this.nextAt = t + 2; return }
      const second = sleeping ?? available.filter(brain => brain !== first && brain.home.distanceTo(first.home) > 2.5)
        .sort((a, b) => a.home.distanceToSquared(first.home) - b.home.distanceToSquared(first.home))[0]
      if (!second || second.home.distanceTo(first.home) < 2.5) { this.nextAt = t + 2; return }
      const kind: SocialKind = sleeping ? 'wake' : this.cycle % 3 === 2 ? 'greet' : 'catch'
      const homes: [THREE.Vector3, THREE.Vector3] = [first.home.clone(), second.home.clone()]
      const destination = first.home.clone().sub(second.home).setY(0).normalize().multiplyScalar(2.4).add(second.home)
      destination.y = first.home.y
      const poses: [SocialPose, SocialPose] = [pose(homes[0]), pose(homes[1])]
      poses[1].awake = kind !== 'wake'
      scene = { kind, actors: [first, second], homes, poses, destination, start: t, duration: kind === 'catch' ? 18 : 15, events: new Set() }
      this.active = scene
      first.social = poses[0]; second.social = poses[1]
      this.lastUsed.set(first.agentId, t); this.lastUsed.set(second.agentId, t)
      this.toy.kind = this.cycle % 2 ? 'browser' : 'document'
      this.cycle++
    }
    if (!scene) return
    const elapsed = Math.max(0, t - scene.start)
    const [a, b] = scene.poses
    a.position.copy(scene.homes[0]); b.position.copy(scene.homes[1])
    for (const p of scene.poses) { p.happy = 0; p.surprise = 0; p.bounce = 0; p.tilt = 0 }
    this.toy.visible = false
    if (scene.kind === 'catch') {
      a.awake = b.awake = true
      a.happy = b.happy = 0.65
      const playing = elapsed >= 1.5 && elapsed < 16.5
      const turns = Math.max(0, elapsed - 1.5) / 2.5
      const turn = Math.floor(turns), flight = turns - turn
      const progress = THREE.MathUtils.clamp(flight / 0.8, 0, 1)
      const from = scene.poses[turn % 2], to = scene.poses[1 - turn % 2]
      this.toy.visible = playing
      this.toy.position.lerpVectors(from.position, to.position, smootherstep(progress))
      this.toy.position.y += 0.9 + Math.sin(progress * Math.PI) * 2
      this.toy.rotation = elapsed * 2.5
      this.toy.scale = Math.min(1, Math.max(0, elapsed - 1.5) * 3, Math.max(0, 16.5 - elapsed) * 3)
      if (playing) {
        from.bounce = Math.sin(Math.PI * Math.min(1, flight * 5)) * 0.2
        to.bounce = Math.sin(Math.PI * THREE.MathUtils.clamp((flight - 0.7) / 0.3, 0, 1)) * 0.25
        from.tilt = Math.sin(flight * Math.PI * 2) * 0.08
      }
      this.emit(scene, 'invite', 0.2, elapsed, 0, 'invite')
      this.emit(scene, 'caught', 3.8, elapsed, 1, 'caught')
    } else {
      const returning = elapsed > 10
      socialRoute(scene.homes[0], scene.destination, returning ? 1 - (elapsed - 10) / 5 : elapsed / 4.5, a.position)
      if (scene.kind === 'wake') {
        const startled = elapsed >= 5.2
        if (startled && !scene.events.has('woken')) { scene.events.add('woken'); scene.actors[1].wakeForSocial(t) }
        b.awake = startled
        const reaction = THREE.MathUtils.clamp((elapsed - 5.2) / 1.2, 0, 1)
        b.surprise = Math.sin(Math.PI * reaction)
        b.bounce = Math.sin(Math.PI * reaction) * 0.75
        b.tilt = Math.sin(reaction * Math.PI * 4) * 0.12 * (1 - reaction)
        a.bounce = Math.sin(Math.PI * THREE.MathUtils.clamp((elapsed - 4.8) / 0.7, 0, 1)) * 0.3
        a.happy = elapsed > 5 ? 1 : 0.1
        b.happy = elapsed > 7 ? 0.85 : 0
        a.tilt = elapsed > 6 && elapsed < 9 ? Math.sin(elapsed * 10) * 0.11 : 0
        this.emit(scene, 'boo', 4.8, elapsed, 0, 'boo')
        this.emit(scene, 'startled', 5.2, elapsed, 1, 'startled')
        this.emit(scene, 'laugh', 7, elapsed, 0, 'laugh')
      } else {
        a.happy = b.happy = 0.8
        a.tilt = elapsed > 4 && elapsed < 9 ? Math.sin(elapsed * 3) * 0.13 : 0
        b.tilt = -a.tilt * 0.7
        this.emit(scene, 'hello', 4.5, elapsed, 0, 'hello')
        this.emit(scene, 'reply', 5.7, elapsed, 1, 'reply')
      }
    }
    a.lookAt.copy(b.position); b.lookAt.copy(a.position)
    if (scene.kind === 'catch' && this.toy.visible) {
      a.lookAt.copy(this.toy.position); b.lookAt.copy(this.toy.position)
    }
  }
}
