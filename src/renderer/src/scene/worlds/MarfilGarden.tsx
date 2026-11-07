import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { forestRandom } from './forestLayout'
import { palaceCourt } from './marfilPalace'
import { MarfilWater } from './MarfilWater'

function mosaicTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1536
  canvas.height = 2048
  const ctx = canvas.getContext('2d')!
  const { width, depth, z } = palaceCourt
  ctx.scale(canvas.width / width, canvas.height / depth)
  ctx.translate(width / 2, depth / 2 - z)
  const random = forestRandom(487)
  const columns = 11, rows = 15, tileWidth = width / columns, tileDepth = depth / rows
  ctx.fillStyle = '#a89b85'
  ctx.fillRect(-width / 2, z - depth / 2, width, depth)
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = -width / 2 + col * tileWidth, y = z - depth / 2 + row * tileDepth
    const shade = 75 + random() * 10
    const wash = ctx.createLinearGradient(x, y, x + tileWidth, y + tileDepth)
    wash.addColorStop(0, `hsl(40 26% ${shade + 7}%)`)
    wash.addColorStop(1, `hsl(36 24% ${shade}%)`)
    ctx.fillStyle = wash
    ctx.fillRect(x + .017, y + .017, tileWidth - .034, tileDepth - .034)
    ctx.save()
    ctx.beginPath(); ctx.rect(x + .021, y + .021, tileWidth - .042, tileDepth - .042); ctx.clip()
    for (let i = 0; i < 13; i++) {
      const start = y + random() * 2.5 - .6, shift = (random() - .45) * 1.19
      ctx.strokeStyle = i % 4 ? 'rgba(142,126,101,.13)' : 'rgba(249,242,222,.38)'
      ctx.lineWidth = .007 + random() ** 2 * .035
      ctx.beginPath(); ctx.moveTo(x, start)
      ctx.bezierCurveTo(x + .68, start + shift * .63, x + 1.25, start + shift * 1.23, x + tileWidth, start + shift)
      ctx.stroke()
    }
    ctx.restore()
    if ((col + row) % 2 === 0) {
      ctx.fillStyle = '#8c987e'
      ctx.beginPath(); ctx.moveTo(x, y - .098); ctx.lineTo(x + .098, y); ctx.lineTo(x, y + .098); ctx.lineTo(x - .098, y); ctx.fill()
    }
  }

  const edge = .42
  for (const inset of [.22, .66, .73]) {
    ctx.strokeStyle = inset === .66 ? '#7c8f7b' : '#ad9465'
    ctx.lineWidth = inset === .66 ? .035 : .024
    ctx.strokeRect(-width / 2 + inset, z - depth / 2 + inset, width - inset * 2, depth - inset * 2)
  }
  const meander = (x: number, y: number, length: number, angle: number) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle)
    ctx.strokeStyle = '#a78d59'; ctx.lineWidth = .038
    for (let offset = 0; offset < length - .7; offset += .69) {
      ctx.beginPath(); ctx.moveTo(offset, .13); ctx.lineTo(offset + .53, .13); ctx.lineTo(offset + .53, -.13)
      ctx.lineTo(offset + .09, -.13); ctx.lineTo(offset + .09, .013); ctx.lineTo(offset + .36, .013); ctx.stroke()
    }
    ctx.restore()
  }
  meander(-width / 2 + .88, z - depth / 2 + edge, width - 1.52, 0)
  meander(width / 2 - .88, z + depth / 2 - edge, width - 1.52, Math.PI)
  meander(width / 2 - edge, z - depth / 2 + .88, depth - 1.52, Math.PI / 2)
  meander(-width / 2 + edge, z + depth / 2 - .88, depth - 1.52, -Math.PI / 2)

  const rosette = (x: number, y: number, radius: number) => {
    ctx.save(); ctx.translate(x, y)
    for (const [r, ink, w] of [[1, '#a38751', .043], [.945, '#8c987e', .061], [.882, '#b19b70', .027], [.67, '#bca982', .018]] as const) {
      ctx.beginPath(); ctx.arc(0, 0, r * radius, 0, Math.PI * 2); ctx.strokeStyle = ink; ctx.lineWidth = w; ctx.stroke()
    }
    for (let i = 0; i < 24; i++) {
      const inner = radius * (i % 2 ? .28 : .40), outer = radius * (i % 2 ? .67 : .84)
      ctx.rotate(Math.PI / 12)
      ctx.fillStyle = i % 2 ? '#a8a98b' : '#c0a67b'
      ctx.beginPath(); ctx.moveTo(0, -inner); ctx.quadraticCurveTo(.18 * radius, -.53 * radius, 0, -outer)
      ctx.quadraticCurveTo(-.18 * radius, -.53 * radius, 0, -inner); ctx.fill()
      ctx.strokeStyle = '#af965f'; ctx.lineWidth = .015; ctx.beginPath(); ctx.moveTo(0, -.72 * radius); ctx.lineTo(0, -.85 * radius); ctx.stroke()
    }
    ctx.restore()
  }
  rosette(0, 0, 3.32)
  rosette(0, 9.68, 1.82)
  for (const side of [-1, 1]) for (const y of [-10.12, 7.65]) rosette(side * 8.4, y, .91)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

const skyVertex = /* glsl */ `
varying vec3 direction;
void main(){ direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`
const skyFragment = /* glsl */ `
varying vec3 direction;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y); }
float clouds(vec2 p){ return .57*noise(p)+.27*noise(p*2.04+7.1)+.12*noise(p*4.15-9.4)+.04*noise(p*8.41); }
void main(){
  vec3 ray=normalize(direction);
  float height=smoothstep(-.31,.43,ray.y);
  float sun=pow(max(0.0,dot(ray,normalize(vec3(-.49,.46,-1.0)))),11.0);
  vec3 blue=mix(vec3(.66,.79,.83),vec3(.24,.49,.67),height)+sun*vec3(.17,.14,.06);
  vec2 p=ray.xz/(.49+abs(ray.y+.28))*6.4+vec2(2.0,1.1);
  float billow=clouds(p);
  float cover=smoothstep(.35,.66,billow) * (1.0-.59*smoothstep(-.10,.51,ray.y));
  vec3 white=mix(vec3(.68,.76,.80),vec3(.99,.96,.89),smoothstep(.36,.67,billow)+sun*.14);
  gl_FragColor=vec4(mix(blue,white,cover),1.0);
  #include <colorspace_fragment>
}`

const mistVertex = /* glsl */ `varying vec2 cloudUv; void main(){cloudUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`
const mistFragment = /* glsl */ `
varying vec2 cloudUv;
void main(){
  vec2 p=cloudUv-.5;
  float swell=sin(p.x*39.0+.5)*.092+sin(p.x*73.0)*.043+sin(p.x*19.0)*.1;
  float veil=exp(-pow((p.y+swell)*3.0,2.0))*(1.0-smoothstep(.07,.5,abs(p.x)));
  float taper=smoothstep(0.0,.22,cloudUv.y)*(1.0-smoothstep(.71,1.0,cloudUv.y));
  gl_FragColor=vec4(.88,.92,.92,veil*taper*.47);
  #include <colorspace_fragment>
}`

export function MarfilGarden({ reduced, detailed }: { reduced: boolean; detailed: boolean }) {
  const mosaic = useMemo(mosaicTexture, [])
  const pediment = useMemo(() => {
    const triangle = new THREE.Shape()
    triangle.moveTo(-6.14, 0); triangle.lineTo(6.14, 0); triangle.lineTo(0, 1.4); triangle.closePath()
    return new THREE.ExtrudeGeometry(triangle, { depth: .27, bevelEnabled: true, bevelThickness: .036, bevelSize: .033, bevelSegments: 2 })
  }, [])
  useEffect(() => () => { mosaic.dispose(); pediment.dispose() }, [mosaic, pediment])
  return <>
    <mesh raycast={() => {}} renderOrder={-10}>
      <sphereGeometry args={[149, 48, 24]} />
      <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
    <mesh position={[0, -.0405, palaceCourt.z]} rotation-x={-Math.PI / 2} receiveShadow raycast={() => {}}>
      <planeGeometry args={[palaceCourt.width, palaceCourt.depth]} />
      <meshStandardMaterial map={mosaic} bumpMap={mosaic} bumpScale={.028} roughness={.76} />
    </mesh>
    <mesh position={[0, 6.64, -22.54]} geometry={pediment} castShadow receiveShadow>
      <meshStandardMaterial color="#d7c6a8" roughness={.81} />
    </mesh>
    {[-15, -33, -54].map((z, i) => <mesh key={z} position={[i % 2 ? 7 : -5, -4.1 + i * 1.15, z]} raycast={() => {}}>
      <planeGeometry args={[62 + i * 16, 9 + i * 2]} />
      <shaderMaterial vertexShader={mistVertex} fragmentShader={mistFragment} side={THREE.DoubleSide} transparent depthWrite={false} toneMapped={false} />
    </mesh>)}
    <MarfilWater detailed={detailed} reduced={reduced} />
  </>
}
