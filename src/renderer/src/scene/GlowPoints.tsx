import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { registry } from './registry'
import { glowBlending } from './palette'

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uScale;
  uniform float uFlicker;
  uniform float uFall;
  uniform float uFallH;
  uniform float uFallBase;
  uniform float uSway;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    if (uFall > 0.0) {
      p.y = uFallBase + mod(position.y - uFallBase - uTime * uFall * (0.6 + 0.8 * aSeed), uFallH);
      p.x += sin(uTime * 0.6 + aSeed * 40.0) * uSway;
      p.z += cos(uTime * 0.5 + aSeed * 31.0) * uSway;
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float f = 1.0 + uFlicker * (0.55 * sin(uTime * (7.0 + aSeed * 6.0) + aSeed * 60.0) + 0.45 * sin(uTime * (17.0 + aSeed * 5.0) + aSeed * 9.0));
    vAlpha = clamp(f, 0.0, 2.0);
    vColor = aColor;
    gl_PointSize = uSize * uScale * (0.75 + 0.25 * f) / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const frag = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    a *= a;
    gl_FragColor = vec4(vColor * (0.8 + 0.4 * vAlpha), a * uOpacity * min(vAlpha, 1.0));
  }
`

export interface GlowPointsProps {
  /** x, y, z de cada punto. */
  positions: number[]
  /** Color de cada punto (r, g, b) o uno para todos. */
  colors?: number[]
  color?: string
  /** Multiplica el color (más de 1 hace brillar con el bloom). */
  intensity?: number
  /** Tamaño en el mundo (metros). */
  size: number
  /** Parpadeo (0 quietos, ~0.5 llama de vela, 1 destello). */
  flicker?: number
  /** Caída (nieve): velocidad, alto del volumen y su base. */
  fall?: number
  fallHeight?: number
  fallBase?: number
  sway?: number
  opacity?: number
  reduced?: boolean
  /** Se avivan cuando el equipo trabaja (registry.work): las luciérnagas del Bosque. */
  lively?: boolean
}

/** Puntos de luz blandos: llamas de vela, luces de árbol, destellos o copos de nieve que caen. */
export function GlowPoints({ positions, colors, color = '#ffffff', intensity = 1, size, flicker = 0, fall = 0, fallHeight = 10, fallBase = 0, sway = 0, opacity = 1, reduced = false, lively = false }: GlowPointsProps) {
  const height = useThree((s) => s.size.height)
  const dpr = useThree((s) => s.viewport.dpr)
  const geo = useMemo(() => {
    const n = positions.length / 3
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const seed = new Float32Array(n)
    for (let i = 0; i < n; i++) seed[i] = ((i * 0.6180339) % 1 + (positions[i * 3] * 0.13) % 1 + 1) % 1
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    let cols = colors
    if (!cols) {
      const c = new THREE.Color(color).multiplyScalar(intensity)
      cols = Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3])
    }
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(cols, 3))
    return g
  }, [positions, colors, color, intensity])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: glowBlending(),
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: size },
          uScale: { value: 1 },
          uFlicker: { value: flicker },
          uFall: { value: fall },
          uFallH: { value: fallHeight },
          uFallBase: { value: fallBase },
          uSway: { value: sway },
          uOpacity: { value: opacity }
        }
      }),
    [size, flicker, fall, fallHeight, fallBase, sway, opacity]
  )
  useEffect(() => () => geo.dispose(), [geo])
  useEffect(() => () => mat.dispose(), [mat])
  useFrame(() => {
    mat.uniforms.uTime.value = registry.time * (reduced ? 0.25 : 1)
    if (lively) mat.uniforms.uOpacity.value = opacity * (0.6 + 0.45 * registry.work)
    // Píxeles por metro a un metro de distancia con el campo de visión de la cámara (30°).
    mat.uniforms.uScale.value = (height * dpr) / (2 * Math.tan((15 * Math.PI) / 180))
  })
  return <points geometry={geo} material={mat} frustumCulled={false} />
}
