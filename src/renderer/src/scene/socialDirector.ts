import * as THREE from 'three'
import type { RobotBrain, SocialPose } from './robotBrain'
import { smootherstep } from './layout'
import type { MusicDanceSignal } from '@/lib/music'

export type SocialKind = 'catch' | 'wake' | 'greet' | 'dance' | 'mirror' | 'bump' | 'encourage'
export type SocialEvent = 'invite' | 'caught' | 'boo' | 'startled' | 'laugh' | 'hello' | 'reply' |
  'danceInvite' | 'danceReply' | 'copyMe' | 'copied' | 'bumpInvite' | 'team' | 'cheer' | 'thanks'
const REPERTOIRE: readonly SocialKind[] = ['catch', 'dance', 'bump', 'mirror', 'greet', 'encourage', 'wake', 'catch']
interface Scene {
  kind: SocialKind
  actors: [RobotBrain, RobotBrain]
  homes: [THREE.Vector3, THREE.Vector3]
  poses: [SocialPose, SocialPose]
  destination: THREE.Vector3
  direction: THREE.Vector3
  start: number
  duration: number
  events: Set<string>
}

const pose = (home: THREE.Vector3): SocialPose => ({ position: home.clone(), lookAt: home.clone(), awake: true, happy: 0, surprise: 0, bounce: 0, tilt: 0, pitch: 0, turn: 0, wink: 0 })

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
  readonly toy = { visible: false, kind: 'document' as 'document' | 'browser' | 'spark' | 'heart', position: new THREE.Vector3(), rotation: 0, scale: 1 }
  private nextAt = 5
  private cycle = 0
  private lastUsed = new Map<string, number>()
  private musicPoses = new Map<RobotBrain, SocialPose>()
  private musicStarted = -1

  clear(): void {
    if (this.active) for (const brain of this.active.actors) {
      brain.social = null
      this.onCancel?.(brain.agentId)
    }
    this.active = null
    this.toy.visible = false
    this.clearMusic()
  }

  private clearMusic(): void {
    for (const [brain, p] of this.musicPoses) if (brain.social === p) brain.social = null
    this.musicPoses.clear()
    this.musicStarted = -1
  }

  private danceToMusic(t: number, brains: ReadonlyMap<string, RobotBrain>, music: MusicDanceSignal, facing?: THREE.Vector3): void {
    if (this.musicStarted < 0) this.musicStarted = t
    for (const [brain, p] of this.musicPoses) {
      if (brains.get(brain.agentId) !== brain || !brain.canSocialize(t)) {
        if (brain.social === p) brain.social = null
        this.musicPoses.delete(brain)
      }
    }
    const fade = smootherstep((t - this.musicStarted) / 0.8)
    for (const brain of brains.values()) {
      if (!brain.canSocialize(t)) continue
      let p = this.musicPoses.get(brain)
      if (!p) { p = pose(brain.home); this.musicPoses.set(brain, p); brain.social = p }
      p.music = true
      const beats = music.beats ?? t * 0.65
      const sway = (beats * 0.5 + brain.phase) * Math.PI * 2
      const pulse = THREE.MathUtils.clamp(music.pulse, 0, 1)
      p.position.copy(brain.home)
      p.position.x += Math.sin(sway) * 0.12 * fade
      p.position.z += Math.cos(sway) * 0.05 * fade
      p.awake = true
      p.happy = 0.6 + pulse * 0.2
      p.surprise = 0
      p.bounce = (music.beats !== null ? Math.max(0, Math.cos(beats * Math.PI * 2)) * 0.18 : 0.025 * (1 + Math.sin(sway))) * fade + pulse * 0.14 * fade
      p.tilt = Math.sin(sway) * 0.15 * fade
      p.pitch = pulse * 0.08 * fade
      p.turn = Math.cos(sway) * 0.12 * fade
      p.wink = music.beats !== null && Math.floor(beats) % 16 === 12 ? Math.sin((beats % 1) * Math.PI) * (brain.phase > 0.5 ? 1 : -1) : 0
      if (facing) p.lookAt.copy(facing)
      else p.lookAt.set(brain.home.x, brain.home.y, brain.home.z + 4)
    }
  }

  private emit(scene: Scene, key: string, at: number, elapsed: number, actor: number, event: SocialEvent): void {
    if (elapsed < at || scene.events.has(key)) return
    scene.events.add(key)
    this.onEvent?.(scene.actors[actor].agentId, event)
  }

  update(t: number, brains: ReadonlyMap<string, RobotBrain>, reduced: boolean, music?: MusicDanceSignal, facing?: THREE.Vector3): void {
    if (reduced) { this.clear(); this.nextAt = t + 5; return }
    if (music?.playing) {
      if (this.active) this.clear()
      this.toy.visible = false
      this.nextAt = t + 5
      this.danceToMusic(t, brains, music, facing)
      return
    }
    if (this.musicStarted >= 0) this.clearMusic()
    let scene = this.active
    if (scene && (scene.actors.some((brain, i) => brains.get(brain.agentId) !== brain || !brain.canSocialize(t) || brain.home.distanceToSquared(scene!.homes[i]) > 0.01) || t >= scene.start + scene.duration)) {
      this.clear()
      this.nextAt = t + 4
      scene = null
    }
    if (!scene && t >= this.nextAt) {
      const available = [...brains.values()].filter(brain => brain.canSocialize(t) && t - (this.lastUsed.get(brain.agentId) ?? -100) > 20)
      available.sort((a, b) => (this.lastUsed.get(a.agentId) ?? -100) - (this.lastUsed.get(b.agentId) ?? -100) || b.persona.chatty - a.persona.chatty || a.agentId.localeCompare(b.agentId))
      const scheduled = REPERTOIRE[this.cycle % REPERTOIRE.length]
      // Las siestas no monopolizan las escenas: también quedan turnos para bailar e imitarse.
      const sleeping = scheduled === 'wake' || this.cycle === 0 ? available.find(brain => brain.eyeSleep > 0.55) : undefined
      const tired = scheduled === 'encourage' ? available.filter(brain => brain.fatigue >= 0.5).sort((a, b) => b.fatigue - a.fatigue)[0] : undefined
      const recipient = sleeping ?? tired
      const first = available.find(brain => brain !== recipient && brain.eyeSleep < 0.55) ?? available.find(brain => brain !== recipient)
      if (!first) { this.nextAt = t + 2; return }
      const second = recipient ?? available.filter(brain => brain !== first && brain.home.distanceTo(first.home) > 2.5)
        .sort((a, b) => a.home.distanceToSquared(first.home) - b.home.distanceToSquared(first.home))[0]
      if (!second || second.home.distanceTo(first.home) < 2.5) { this.nextAt = t + 2; return }
      const kind: SocialKind = sleeping ? 'wake' : scheduled === 'wake' ? 'greet' : scheduled
      const homes: [THREE.Vector3, THREE.Vector3] = [first.home.clone(), second.home.clone()]
      const destination = first.home.clone().sub(second.home).setY(0).normalize().multiplyScalar(2.4).add(second.home)
      destination.y = first.home.y
      const direction = destination.clone().sub(second.home).setY(0).normalize()
      const poses: [SocialPose, SocialPose] = [pose(homes[0]), pose(homes[1])]
      poses[1].awake = kind !== 'wake'
      scene = { kind, actors: [first, second], homes, poses, destination, direction, start: t, duration: kind === 'catch' ? 18 : kind === 'dance' ? 17 : kind === 'mirror' ? 16 : 15, events: new Set() }
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
    for (const p of scene.poses) { p.happy = 0; p.surprise = 0; p.bounce = 0; p.tilt = 0; p.pitch = 0; p.turn = 0; p.wink = 0 }
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
    } else if (scene.kind === 'dance') {
      const envelope = smootherstep((elapsed - 1) / 1.5) * (1 - smootherstep((elapsed - 14) / 2))
      for (const [i, actor] of scene.poses.entries()) {
        const beat = (elapsed - 1) * Math.PI * 2 / 1.35 + i * Math.PI
        actor.position.x += Math.sin(beat) * 0.32 * envelope
        actor.position.z += Math.cos(beat) * 0.12 * envelope
        actor.bounce = Math.abs(Math.sin(beat)) * 0.3 * envelope
        actor.tilt = Math.cos(beat) * 0.22 * envelope
        actor.pitch = Math.sin(beat) * 0.11 * envelope
        actor.turn = Math.PI * 2 * smootherstep((elapsed - 7) / 2.2) * (i ? -1 : 1)
        actor.happy = 0.95
      }
      this.emit(scene, 'danceInvite', 0.3, elapsed, 0, 'danceInvite')
      this.emit(scene, 'danceReply', 1.6, elapsed, 1, 'danceReply')
    } else if (scene.kind === 'mirror') {
      for (const [i, actor] of scene.poses.entries()) {
        const play = Math.max(0, elapsed - 1.5 - i * 0.65)
        const action = Math.floor(play / 2.6) % 4
        const pulse = Math.sin(Math.PI * (play / 2.6 % 1)) * (1 - smootherstep((elapsed - 13) / 2))
        const side = i ? -1 : 1
        if (action === 0) actor.tilt = side * pulse * 0.26
        if (action === 1) actor.wink = side * pulse
        if (action === 2) actor.bounce = pulse * 0.42
        if (action === 3) { actor.pitch = -pulse * 0.18; actor.turn = side * pulse * 0.5 }
        actor.happy = 0.65
      }
      this.emit(scene, 'copyMe', 0.3, elapsed, 0, 'copyMe')
      this.emit(scene, 'copied', 6, elapsed, 1, 'copied')
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
      } else if (scene.kind === 'bump') {
        const contact = Math.sin(Math.PI * THREE.MathUtils.clamp((elapsed - 5) / 1.2, 0, 1))
        a.position.addScaledVector(scene.direction, -0.12 * contact)
        b.position.addScaledVector(scene.direction, 0.12 * contact)
        a.bounce = b.bounce = contact * 0.22
        a.tilt = -contact * 0.14; b.tilt = contact * 0.14
        a.happy = b.happy = 1
        a.wink = elapsed > 6 && elapsed < 8 ? Math.sin((elapsed - 6) * Math.PI / 2) : 0
        this.toy.visible = contact > 0.01
        this.toy.kind = 'spark'
        this.toy.position.lerpVectors(a.position, b.position, 0.5)
        this.toy.position.y += 1.15
        this.toy.scale = contact * 1.1
        this.toy.rotation = elapsed * 2
        this.emit(scene, 'bumpInvite', 4.5, elapsed, 0, 'bumpInvite')
        this.emit(scene, 'team', 5.7, elapsed, 1, 'team')
      } else if (scene.kind === 'encourage') {
        const encouraged = smootherstep((elapsed - 5) / 2)
        a.happy = 0.85; b.happy = 0.1 + encouraged * 0.9
        b.pitch = (1 - encouraged) * 0.14 + Math.sin(elapsed * 4) * encouraged * 0.06
        a.wink = Math.sin(Math.PI * THREE.MathUtils.clamp((elapsed - 5.5) / 1.5, 0, 1))
        b.bounce = Math.sin(Math.PI * THREE.MathUtils.clamp((elapsed - 6) / 1.4, 0, 1)) * 0.18
        this.toy.visible = elapsed > 4.5 && elapsed < 9
        this.toy.kind = 'heart'
        this.toy.position.lerpVectors(a.position, b.position, encouraged)
        this.toy.position.y += 1 + Math.sin(encouraged * Math.PI) * 0.6
        this.toy.scale = smootherstep((elapsed - 4.5) / 0.5) * (1 - smootherstep((elapsed - 8) / 1))
        this.toy.rotation = Math.sin(elapsed * 2) * 0.3
        this.emit(scene, 'cheer', 4.5, elapsed, 0, 'cheer')
        this.emit(scene, 'thanks', 6.4, elapsed, 1, 'thanks')
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
