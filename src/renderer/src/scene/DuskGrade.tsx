// Atardecer de toda la imagen: muchos temas pintan su propio cielo (nubes, cúpulas, nebulosas) sin luces, así que
// bajar las luces no basta para que se haga de noche. Este efecto oscurece y enfría la imagen según `dusk` (0–1).
// Con el bloom encendido va en la cadena de efectos y respeta lo que brilla (ventanas, pantallas, farolas); sin él
// (equipos modestos) es una capa que multiplica la imagen entera, sin coste apreciable.
import { forwardRef, useEffect, useMemo } from 'react'
import { Effect } from 'postprocessing'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'

/** Color al que tiende la imagen de noche (multiplica): azul oscuro. */
const NIGHT = new THREE.Vector3(.24, .29, .44)

const fragment = /* glsl */ `
uniform float dusk;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float l = dot(inputColor.rgb, vec3(.2126, .7152, .0722));
  vec3 night = inputColor.rgb * vec3(${NIGHT.x}, ${NIGHT.y}, ${NIGHT.z}) + vec3(.004, .007, .016);
  float glow = smoothstep(1.05, 2.2, l);
  outputColor = vec4(mix(inputColor.rgb, mix(night, inputColor.rgb, glow), dusk), inputColor.a);
}`

class DuskGradeEffect extends Effect {
  constructor() {
    super('DuskGrade', fragment, { uniforms: new Map([['dusk', new THREE.Uniform(0)]]) })
  }
}

/** Para dentro de <EffectComposer>. */
export const DuskGrade = forwardRef<DuskGradeEffect, { dusk: number }>(function DuskGrade({ dusk }, ref) {
  const effect = useMemo(() => new DuskGradeEffect(), [])
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => { effect.uniforms.get('dusk')!.value = dusk; invalidate() }, [effect, dusk, invalidate])
  useEffect(() => () => effect.dispose(), [effect])
  return <primitive ref={ref} object={effect} dispose={null} />
})

/** Sin cadena de efectos: un rectángulo a pantalla completa que multiplica lo ya pintado. */
export function DuskVeil({ dusk }: { dusk: number }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform vec3 tint; void main(){ gl_FragColor = vec4(tint, 1.0); }',
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
  }), [])
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    material.uniforms.tint.value.setRGB(1 + (NIGHT.x - 1) * dusk, 1 + (NIGHT.y - 1) * dusk, 1 + (NIGHT.z - 1) * dusk)
    invalidate()
  }, [material, dusk, invalidate])
  useEffect(() => () => material.dispose(), [material])
  if (dusk <= 0) return null
  return <mesh frustumCulled={false} renderOrder={10_000} material={material} raycast={() => {}}><planeGeometry args={[2, 2]} /></mesh>
}
