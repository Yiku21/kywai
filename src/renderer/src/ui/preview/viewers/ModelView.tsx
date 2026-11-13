// Modelos 3D en el panel de vista previa (.glb, .gltf, .obj, .stl, .ply, .fbx, .3mf): se ven con luz y se giran con el
// ratón (arrastrar para girar, rueda para acercar, botón derecho para mover). Con three.js, el mismo motor del espacio 3D.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { t } from '@/lib/i18n'
import { errorText } from '../../common/util'
import { useBytes, ViewerBusy, ViewerFail } from './shared'
import s from './viewers.module.css'

/** Convierte los bytes en un objeto de three.js según la extensión. Los cargadores se piden solo al usarlos. */
async function parseModel(ext: string, data: ArrayBuffer, url: string): Promise<{ object: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  const base = url.slice(0, url.lastIndexOf('/') + 1)
  switch (ext) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const gltf = await new GLTFLoader().parseAsync(data, base)
      return { object: gltf.scene, clips: gltf.animations }
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
      return { object: new OBJLoader().parse(new TextDecoder().decode(data)), clips: [] }
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      const object = new FBXLoader().parse(data, base)
      return { object, clips: object.animations }
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js')
      return { object: new ThreeMFLoader().parse(data), clips: [] }
    }
    case 'stl':
    case 'ply': {
      const geometry =
        ext === 'stl'
          ? new (await import('three/examples/jsm/loaders/STLLoader.js')).STLLoader().parse(data)
          : new (await import('three/examples/jsm/loaders/PLYLoader.js')).PLYLoader().parse(data)
      geometry.computeVertexNormals()
      const colored = !!geometry.getAttribute('color')
      const material = new THREE.MeshStandardMaterial({ color: colored ? 0xffffff : 0xb9c3d3, vertexColors: colored, roughness: 0.55, metalness: 0.1 })
      const object = geometry.index || geometry.getAttribute('normal') ? new THREE.Mesh(geometry, material) : new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.01, vertexColors: colored }))
      return { object, clips: [] }
    }
  }
  throw new Error(ext)
}

export default function ModelView({ url, name }: { url: string; name: string }) {
  const bytes = useBytes(url)
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'busy' | 'done' | { error: string }>('busy')
  const ext = name.split('.').pop()?.toLowerCase() ?? ''

  useEffect(() => {
    const host = hostRef.current
    if (bytes.status !== 'ready' || !host) return
    let disposed = false
    let cleanup = (): void => {}
    parseModel(ext, bytes.data, url).then(
      ({ object, clips }) => {
        if (disposed) return
        cleanup = mount(host, object, clips)
        setState('done')
      },
      (e) => !disposed && setState({ error: errorText(e) })
    )
    return () => {
      disposed = true
      cleanup()
    }
  }, [bytes, url, ext])

  if (bytes.status === 'error') return <ViewerFail message={bytes.message} />
  if (typeof state === 'object') return <ViewerFail message={t('No se pudo abrir el modelo 3D: {error}', { error: state.error })} />
  return (
    <div className={s.model}>
      {state === 'busy' && <ViewerBusy label={t('Abriendo el modelo 3D…')} />}
      <div ref={hostRef} className={s.modelCanvas} />
      {state === 'done' && <p className={s.modelHint}>{t('Arrastra para girar · rueda para acercar · botón derecho para mover')}</p>}
    </div>
  )
}

/** Monta la escena en `host` y devuelve cómo desmontarla. Solo se dibuja cuando algo cambia (o si hay animación). */
function mount(host: HTMLElement, object: THREE.Object3D, clips: THREE.AnimationClip[]): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.append(renderer.domElement)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(3, 5, 4)
  scene.add(sun)
  const back = new THREE.DirectionalLight(0xbcd2ff, 0.8)
  back.position.set(-4, 2, -3)
  scene.add(back)
  scene.add(object)

  // Centrado y a una distancia en la que se ve entero.
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(size.length() / 2, 1e-3)
  object.position.sub(center)
  const camera = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100)
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(20)) * 1.05
  camera.position.set(dist * 0.6, dist * 0.45, dist * 0.75)
  const grid = new THREE.GridHelper(radius * 4, 20, 0x8090a8, 0x8090a8)
  ;(grid.material as THREE.Material).opacity = 0.18
  ;(grid.material as THREE.Material).transparent = true
  grid.position.y = -size.y / 2
  scene.add(grid)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = radius * 0.2
  controls.maxDistance = radius * 20

  const mixer = clips.length ? new THREE.AnimationMixer(object) : null
  if (mixer) mixer.clipAction(clips[0]).play()
  const clock = new THREE.Clock()

  let frame = 0
  const draw = (): void => {
    frame = 0
    const moving = controls.update()
    if (mixer) mixer.update(clock.getDelta())
    renderer.render(scene, camera)
    if (moving || mixer) frame = requestAnimationFrame(draw)
  }
  const request = (): void => {
    if (!frame) frame = requestAnimationFrame(draw)
  }
  controls.addEventListener('change', request)
  const resize = (): void => {
    const w = host.clientWidth || 1
    const h = host.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    request()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(host)
  resize()

  return () => {
    cancelAnimationFrame(frame)
    ro.disconnect()
    controls.dispose()
    mixer?.stopAllAction()
    object.traverse((o) => {
      const mesh = o as THREE.Mesh
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose()
        m.dispose()
      }
    })
    renderer.dispose()
    renderer.domElement.remove()
  }
}
