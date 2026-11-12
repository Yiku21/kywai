import * as THREE from 'three'

// Aspecto «Píxel» de los agentes: el personaje 3D animado se dibuja cada fotograma en una textura pequeña vista desde
// la cámara (cada píxel de la textura ocupa 2, 3 o 4 píxeles de pantalla, según «Tamaño del píxel»), y esa textura se pone en un cartel que mira a la cámara justo donde está el
// personaje. Así se ve como un sprite de pixel art de videojuego, pero sigue animado, girando y caminando de verdad.
// El personaje queda en una capa que la cámara principal no dibuja; el cartel sí está en la escena normal.

/** Capa de los personajes que se dibujan como sprite (la cámara principal solo ve la capa 0). */
export const PIXEL_LAYER = 5

/** Cuánto del alto del cuadro ocupa el personaje (deja sitio a brazos levantados y pasos). */
const FILL = 0.8

/**
 * Lado de la textura del sprite: lo que mide el cuadro en pantalla partido por el tamaño del píxel, en múltiplos de 4
 * (para no rehacer la textura con cada paso de zoom) y entre 16 y 128.
 */
export function spriteTexels(screenSide: number, block: number): number {
  const n = Math.round(screenSide / Math.max(1, block) / 4) * 4
  return Math.min(128, Math.max(16, n))
}

/** Radio del cuadro alrededor del personaje: su altura entera más margen, partido entre dos. */
export function frameRadius(height: number): number {
  return height / FILL / 2
}

/** Distancia → ángulo de visión de la cámara del sprite para que el cuadro abarque justo ese radio. */
export function frameFov(radius: number, distance: number): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(radius / Math.max(distance, radius * 1.05)))
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** El personaje se dibuja con SUPER × SUPER muestras por píxel del sprite y se promedian (sin ruido en las texturas). */
const SUPER = 4

// Cada píxel del sprite es la media de su bloque de muestras; contorno oscuro de un píxel y colores con menos tonos,
// como en un sprite dibujado a mano.
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float cells;
uniform vec3 ink;
uniform float levels;
varying vec2 vUv;
const float S = ${SUPER.toFixed(1)};
vec4 cell(vec2 c) {
  vec4 acc = vec4(0.0);
  for (int i = 0; i < ${SUPER}; i++) {
    for (int j = 0; j < ${SUPER}; j++) {
      vec4 t = texture2D(map, (c * S + vec2(float(i), float(j)) + 0.5) / (cells * S));
      acc += vec4(t.rgb * t.a, t.a);
    }
  }
  return acc / (S * S);
}
float covered(vec2 c) {
  return texture2D(map, (c + 0.5) / cells).a;
}
void main() {
  vec2 c = floor(vUv * cells);
  vec4 v = cell(c);
  if (v.a < 0.5) {
    float n = max(max(covered(c + vec2(1.0, 0.0)), covered(c - vec2(1.0, 0.0))), max(covered(c + vec2(0.0, 1.0)), covered(c - vec2(0.0, 1.0))));
    if (n < 0.5) discard;
    gl_FragColor = vec4(ink, 1.0);
  } else {
    vec3 g = pow(max(v.rgb / v.a, vec3(0.0)), vec3(1.0 / 2.2));
    g = floor(g * levels + 0.5) / levels;
    gl_FragColor = vec4(pow(g, vec3(2.2)), 1.0);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export interface PixelSprite {
  /** Cartel que va en la escena (capa 0). */
  readonly card: THREE.Mesh
  /** Pone el personaje en la capa del sprite y le añade su luz propia. */
  attach(character: THREE.Object3D, height: number): void
  /**
   * Dibuja el personaje en la textura y coloca el cartel. Llamar cada fotograma, después de mover el personaje.
   * `block`: cuántos píxeles de pantalla ocupa cada píxel del sprite.
   */
  render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, block: number): void
  dispose(): void
}

export function createPixelSprite(): PixelSprite {
  let texels = 0
  let target: THREE.WebGLRenderTarget | null = null
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null },
      cells: { value: 16 },
      ink: { value: new THREE.Color('#1a1426') },
      levels: { value: 10 }
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: false,
    depthWrite: true
  })
  const geo = new THREE.PlaneGeometry(1, 1)
  const card = new THREE.Mesh(geo, mat)
  card.name = 'sprite-pixel'
  card.frustumCulled = false
  card.renderOrder = 1
  card.raycast = () => {}

  const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 500)
  cam.layers.set(PIXEL_LAYER)
  // Luz propia del sprite (en su capa): ambiente suave y una luz desde la cámara un poco por arriba.
  const hemi = new THREE.HemisphereLight('#fff6ea', '#4a4560', 2)
  const key = new THREE.DirectionalLight('#ffffff', 2.4)
  const keyTarget = new THREE.Object3D()
  key.target = keyTarget
  for (const l of [hemi, key, keyTarget]) l.layers.set(PIXEL_LAYER)

  let char: THREE.Object3D | null = null
  let h = 1
  const center = new THREE.Vector3()
  const camPos = new THREE.Vector3()
  const scale = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const prevClear = new THREE.Color()
  const view = new THREE.Vector2()

  return {
    card,
    attach(character, height) {
      char = character
      h = height
      character.traverse((o) => o.layers.set(PIXEL_LAYER))
      character.add(hemi, key, keyTarget)
      keyTarget.position.set(0, height * 0.5, 0)
    },
    render(renderer, camera, block) {
      if (!char) return
      char.updateWorldMatrix(true, true)
      char.matrixWorld.decompose(tmp, card.quaternion, scale)
      const s = Math.max(scale.x, scale.y, scale.z)
      center.set(0, h * 0.5, 0).applyMatrix4(char.matrixWorld)
      const r = frameRadius(h) * s
      camera.getWorldPosition(camPos)
      const d = camPos.distanceTo(center)
      // Lo que mide el cuadro en pantalla (píxeles CSS) con la cámara principal.
      renderer.getSize(view)
      const onScreen = ((2 * r) / (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * view.y
      const n = spriteTexels(onScreen, block)
      if (n !== texels) {
        target?.dispose()
        const side = n * SUPER
        target = new THREE.WebGLRenderTarget(side, side, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true })
        texels = n
        mat.uniforms.map.value = target.texture
        mat.uniforms.cells.value = n
      }
      cam.position.copy(camPos)
      cam.up.set(0, 1, 0)
      cam.lookAt(center)
      cam.fov = frameFov(r, d)
      cam.near = Math.max(0.01, d - r * 2)
      cam.far = d + r * 2
      cam.updateProjectionMatrix()
      cam.updateMatrixWorld()
      // Luz principal desde la cámara, un poco por arriba y a un lado (en coordenadas del personaje).
      tmp.copy(camPos).sub(center).normalize().multiplyScalar(r * 3).add(center)
      tmp.y += r * 2
      key.position.copy(char.worldToLocal(tmp))

      const prevTarget = renderer.getRenderTarget()
      const prevAlpha = renderer.getClearAlpha()
      renderer.getClearColor(prevClear)
      const prevAuto = renderer.autoClear
      const prevShadow = renderer.shadowMap.autoUpdate
      renderer.shadowMap.autoUpdate = false
      renderer.setRenderTarget(target)
      renderer.setClearColor(0x000000, 0)
      renderer.autoClear = true
      renderer.clear(true, true, false)
      renderer.render(char, cam)
      renderer.setRenderTarget(prevTarget)
      renderer.setClearColor(prevClear, prevAlpha)
      renderer.autoClear = prevAuto
      renderer.shadowMap.autoUpdate = prevShadow

      // El cartel, perpendicular a la cámara del sprite y del tamaño exacto del cuadro a esa distancia:
      // desde la cámara principal se ve en el mismo sitio y tamaño que el personaje.
      const side = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
      card.position.copy(center)
      card.quaternion.copy(cam.quaternion)
      card.scale.set(side, side, 1)
    },
    dispose() {
      if (char) char.remove(hemi, key, keyTarget)
      char = null
      target?.dispose()
      target = null
      geo.dispose()
      mat.dispose()
    }
  }
}
