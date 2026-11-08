import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { StationConfig } from '@shared/types'
import { t } from '@/lib/i18n'
import { useHomeNight } from '@/lib/homeLighting'
import { useCowork, useData } from '@/store/cowork'
import { Model as Parts, type Vec } from './models'
import { WorldModel } from './WorldScenery'
import { kywaiArchitecture, addHomePlant, HOME_WOOD, HOME_BRASS } from './kywaiArchitecture'
import { HomeOcean } from './HomeOcean'
import { HomeNameplate } from './HomeNameplate'
import { homeRole } from './homeLayout'
import { registry, type PulseTarget } from '../registry'
import { surfaceMaps } from './surfaces'
import { HomeComfort, homeComfortParts } from './HomeComfort'
import { KywaiCoast } from './KywaiCoast'
import { HomeSkyDome } from './HomeSkyDome'


function homeProps(stations: StationConfig[], names: Record<string, string>) {
  const m = new Parts(), wood = HOME_WOOD, brass = HOME_BRASS
  const book = (x: number, y: number, z: number, k: number, standing = false) => {
    const color = ['#697864','#9b7854','#6a6385','#946654','#bea46d'][k % 5]
    m.box([x,y,z], standing ? [.13,.55,.36] : [.62,.09,.42], color)
    m.box([x,y + (standing ? 0 : .01),z + .005], standing ? [.104,.47,.34] : [.58,.065,.39], '#e8dab9')
    for (const dy of [-.18,.18]) if (standing) m.box([x,y+dy,z+.19],[.12,.018,.009],brass)
  }
  for (const s of stations) {
    const [x,z] = s.position, role = homeRole(names[s.id] ?? s.label)
    if (role === 'hermes') {
      m.add('cylinder', [3,1.1,-1.8], [.42,.08,.42], brass)
      m.ring([3,1.55,-1.8],.4,brass,[Math.PI/2.9,0,.3],0)
      m.beam([3,1.1,-1.8],[3,1.52,-1.8],.035,brass)
      continue
    }
    if (role === 'claude') {
      m.box([x-1.0,1.7,z-.6],[1.65,2.6,.5],wood)
      for (let row=0;row<3;row++) {
        m.box([x-1, .55+row*.75,z-.3],[1.65,.06,.52],brass)
        for(let j=0;j<9;j++) book(x-1.63+j*.16,.85+row*.75,z-.35,j+row,true)
      }
      for(let j=0;j<4;j++) book(x+1.05,.95+j*.11,z+.6,j)
    } else if(role === 'gemini') {
      m.add('cylinder',[x+.65,.94,z+.9],[.65,.03,.65],'#5b4b8a')
      for(const dx of [.35,1.0]) m.add('crystal',[x+dx,1.45,z+.75],[.25,.63,.25],'#bfdce3')
      for(let j=0;j<5;j++) m.ring([x+.65,.97,z+.9],.14+j*.1,brass,undefined,0)
    } else if(role === 'aider') {
      for(let j=0;j<11;j++) {
        const xx=x-1+j*.2,h=Math.sin(j/10*Math.PI)*.65
        m.box([xx,1.08+h,z+1],[.18,.14,.5],'#bba17b')
        if(j%2===0) m.beam([xx,1.05,z+1],[xx,1.5+h,z+1],.023,brass)
        if(j>0) m.beam([xx-.2,1.5+Math.sin((j-1)/10*Math.PI)*.65,z+1],[xx,1.5+h,z+1],.025,brass)
      }
      for(let j=0;j<8;j++) m.box([x-1.1+(j%3)*.23,1.04+Math.floor(j/3)*.18,z+.18],[.2,.17,.2],'#d4b98b')
    } else if(role === 'muse') {
      for(let j=0;j<6;j++) {
        m.add('cylinder',[x-.9+j*.19,1.09,z+1.02],[.07,.29,.07],['#a78bc9','#8db6a3','#d9a083'][j%3])
        m.add('cylinder',[x-.9+j*.19,1.25,z+1.02],[.075,.045,.075],brass)
      }
      const pts:Vec[] = Array.from({length:23},(_,i)=>[x+1+Math.sin(i*.26)*.18,1.04+i*.045,z+.45+Math.cos(i*.26)*.12])
      for(let j=1;j<pts.length;j++) m.beam(pts[j-1],pts[j],.07,'#ddd6b9')
      for(let j=0;j<7;j++) m.beam([x-.7,1.05,z+.15],[x-.6+j*.03,1.7,z+.15],.012,j%2?brass:'#b17c63')
    } else if(role === 'codex') {
      // Brass XY plotter and a skeletal prototype beside the drawing.
      for(const dx of [-.65,.65]) {
        m.beam([x+dx,.99,z+.4],[x+dx,1.55,z+.4],.035,brass)
        m.beam([x+dx,1.55,z+.4],[x+dx,1.55,z+1.1],.035,brass)
      }
      m.beam([x-.65,1.55,z+.65],[x+.65,1.55,z+.65],.045,brass)
      for(let j=0;j<8;j++) {
        const a=j%4/4*Math.PI*2,xx=x+1.08+Math.cos(a)*.28,zz=z+.5+Math.sin(a)*.28,yy=1.03+Math.floor(j/4)*.45
        m.add('sphere',[xx,yy,zz],[.055,.055,.055],brass)
        if(j<4) m.beam([xx,yy,zz],[xx,yy+.45,zz],.018,brass)
        m.beam([xx,yy,zz],[x+1.08+Math.cos(a+Math.PI/2)*.28,yy,z+.5+Math.sin(a+Math.PI/2)*.28],.018,brass)
      }
    } else {
      // Actual terminal content is painted once into the monitor texture below.
      m.box([x+.65,1.18,z+.5],[.7,.06,.42],brass)
      m.beam([x+.65,1.1,z+.5],[x+.65,1.65,z+.16],.05,wood)
      for(let j=0;j<8;j++) m.box([x-.95+(j%4)*.21,1.01+Math.floor(j/4)*.17,z+.5],[.18,.15,.2],'#d5bc93')
      if(role==='copilot') {
        m.box([x-.8,1.02,z+.9],[.75,.045,.45],'#a6a492')
        m.box([x-.8,1.29,z+.66],[.75,.50,.045],brass,0,[-.2,0,0])
        m.box([x-.8,1.29,z+.69],[.66,.41,.012],'#3d5554',0,[-.2,0,0])
        for(let k=0;k<3;k++) m.box([x-.8,1.18+k*.08,z+.714],[.48,.01,.008],'#77b8af')
      }
      if(role === 'qwen') {
        m.beam([x-1.35,.95,z+.1],[x-1.35,1.95,z+.1],.045,brass)
        m.add('crystal',[x-1.35,2.1,z+.1],[.13,.32,.13],'#f6cb85',.6)
      }
    }
  }
  const treeFirst=m.pieces.length
  // Twisted olive-like trunk with spreading roots and fine branching, rather than a solid green crown.
  for(let j=0;j<13;j++) {
    const a=j*2.399;let last:Vec=[0,.85,0]
    for(let k=1;k<13;k++){const r=k/13*1.15,next:Vec=[Math.cos(a+r)*r,.85-r*.48,Math.sin(a+r)*r];m.beam(last,next,.013,'#ad8958');last=next}
  }
  const trunk=(t:number):Vec=>[Math.sin(t*4)*.13,.8+t*2.5,Math.cos(t*3)*.1]
  for(let k=0;k<22;k++) m.beam(trunk(k/22),trunk((k+1)/22),.085-k*.002,wood)
  for(let j=0;j<22;j++) {
    const a=j*2.399,t=.25+(j%7)*.085,r=.55+(j%5)*.18,start=trunk(t)
    const tip:Vec=[Math.cos(a)*r,start[1]+.6,Math.sin(a)*r]
    const mid:Vec=[tip[0]*.5,start[1]+.4,tip[2]*.5]
    m.beam(start,mid,.022,wood);m.beam(mid,tip,.012,wood)
    for(let k=0;k<35;k++) {
      const b=k*2.399+j,rad=.1+((k*17+j*3)%29)/29*.38
      m.add('leaf',[tip[0]+Math.cos(b)*rad,tip[1]+Math.sin(b*1.3)*.27,tip[2]+Math.sin(b)*rad],
        [.12,.24,.065],['#5d8155','#819661','#99aa75','#4f704e'][k%4],0,[1.2+(k%3)*.3,b,.4])
    }
  }
  for(let i=treeFirst;i<m.pieces.length;i++) m.pieces[i].wind={root:[0,.8,0],height:2.7,flexibility:.52}
  // The notebook lies open in front of the user's chair.
  for(const x of [-.34,.34]) {
    m.box([x,1.08,2.97],[.66,.07,.8],wood,0,[0,0,x*.15])
    m.box([x,1.125,2.97],[.63,.028,.77],'#f5ead4',0,[0,0,x*.15])
    for(let j=0;j<7;j++) m.box([x,1.15,2.72+j*.07],[.42,.005,.009],'#b2a08a')
  }
  return m.pieces
}

function Plaque({ text, at, width = 2.2, tilt = 0 }: { text: string; at: Vec; width?: number; tilt?: number }) {
  const map = useMemo(() => {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256
    const c=canvas.getContext('2d')!
    c.fillStyle='#d2b27a';c.fillRect(0,0,1024,256);c.strokeStyle='#8b683e';c.lineWidth=12;c.strokeRect(9,9,1006,238)
    for(const x of [35,989]) for(const y of [35,221]) {c.fillStyle='#886b42';c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fill()}
    c.fillStyle='#493725';c.textAlign='center';c.textBaseline='middle';c.font=`600 ${text.length>17?66:88}px Georgia,serif`;c.fillText(text,512,136,900)
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;return texture
  },[text])
  useEffect(()=>()=>map.dispose(),[map])
  return <group position={at} rotation-x={tilt}>
    <mesh position={[0,0,-.045]}><boxGeometry args={[width+.10,width/4+.065,.075]} /><meshStandardMaterial color="#8e623f" roughness={.65} /></mesh>
    <mesh><planeGeometry args={[width,width/4]} /><meshStandardMaterial map={map} roughness={.56} metalness={.22} /></mesh>
  </group>
}

function Screen({ x,z,route=false }: { x:number; z:number; route?:boolean }) {
  const map=useMemo(()=>{
    const c=document.createElement('canvas');c.width=512;c.height=340;const g=c.getContext('2d')!
    g.fillStyle=route?'#e7d7b7':'#203233';g.fillRect(0,0,512,340)
    if(route){g.strokeStyle='#4d9caa';g.lineWidth=4;g.beginPath();for(let j=0;j<8;j++){const x=45+j*60,y=170+Math.sin(j*1.5)*90;if(j===0)g.moveTo(x,y);else g.lineTo(x,y)}g.stroke();for(let j=0;j<8;j++){g.fillStyle='#408b9e';g.beginPath();g.arc(45+j*60,170+Math.sin(j*1.5)*90,9,0,Math.PI*2);g.fill()}}
    else {g.font='19px monospace';for(let j=0;j<12;j++){g.fillStyle=['#b0c9a1','#83c8c0','#d9b977'][j%3];g.fillText(j===0?'> kywai / workspace':`${' '.repeat(j%3)}${['const home = {','build: together,','status: ready,','ideas: connected','};'][j%5]}`,24,30+j*24)}}
    const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;return tex
  },[route])
  useEffect(()=>()=>map.dispose(),[map])
  return <group position={[x,1.57,z+.2]} rotation-x={-.12}>
    <mesh><boxGeometry args={[1.12,.80,.065]} /><meshStandardMaterial color={HOME_BRASS} metalness={.5} roughness={.4} /></mesh>
    <mesh position={[0,0,.038]}><planeGeometry args={[1.02,.68]} /><meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={route?.02:.24} roughness={.5} /></mesh>
  </group>
}

function Lantern({ at, seed, reduced }: { at:Vec;seed:number;reduced:boolean }) {
  const night=useHomeNight()
  const lamp=useRef<THREE.Group>(null!)
  useFrame(()=>{lamp.current.rotation.z=reduced?0:Math.sin(registry.time*.43+seed)*.025})
  return <group position={at} ref={lamp}>
    <mesh position={[0,.7,0]}><cylinderGeometry args={[.012,.012,1.4,8]} /><meshStandardMaterial color="#7d694c" /></mesh>
    <mesh scale={[.52,.67,.52]}><sphereGeometry args={[1,32,24]} /><meshStandardMaterial color="#f2dab3" emissive="#ffd49b" emissiveIntensity={night?1.15:.6} roughness={.9} /></mesh>
    {Array.from({length:10},(_,i)=><mesh key={i} position={[0,-.54+i*.12,0]} rotation-x={Math.PI/2}><torusGeometry args={[Math.sqrt(Math.max(.06,1-((- .54+i*.12)/.67)**2))*.525,.009,6,48]} /><meshStandardMaterial color="#af8251" transparent opacity={.65} /></mesh>)}
    <pointLight color="#ffd095" intensity={night?25:7} distance={night?12:7} decay={2} />
  </group>
}

function HomeEffects({ reduced, codex }: { reduced:boolean;codex?:[number,number] }) {
  const pulse=useRef({start:-100,strength:0})
  const heartLight=useRef<THREE.PointLight>(null!)
  useEffect(()=>{const fx:PulseTarget={pulse:(_color,strength=1)=>{pulse.current={start:registry.time,strength}}};registry.core=fx;return ()=>{if(registry.core===fx)registry.core=null}},[])
  const prism=useRef<THREE.Group>(null!),pen=useRef<THREE.Mesh>(null!),steam=useRef<THREE.Points>(null!)
  const geometry=useMemo(()=>{const g=new THREE.BufferGeometry(),p=new Float32Array(50*3);g.setAttribute('position',new THREE.BufferAttribute(p,3));return g},[])
  const crystal=useMemo(()=>new THREE.OctahedronGeometry(.64),[])
  const edges=useMemo(()=>new THREE.EdgesGeometry(crystal),[crystal])
  useEffect(()=>()=>{geometry.dispose();crystal.dispose();edges.dispose()},[geometry,crystal,edges])
  useFrame(()=>{
    const t=reduced?0:registry.time;prism.current.rotation.y=t*.16
    heartLight.current.intensity=.35+Math.max(0,1-(registry.time-pulse.current.start)/1.8)*pulse.current.strength*2
    if(pen.current) pen.current.position.x=(codex?.[0]??0)+Math.sin(t*.7)*.43
    const p=geometry.getAttribute('position') as THREE.BufferAttribute
    for(let j=0;j<50;j++){const y=(j/50+t*.12)%1;p.setXYZ(j,-5.8+Math.sin(y*7+t)*y*.09,1.03+y*.8,12+Math.cos(y*9+t)*y*.06)}p.needsUpdate=true
  })
  return <>
    <pointLight ref={heartLight} position={[0,2,0]} color="#88ddc7" distance={7} intensity={.35} />
    <group ref={prism} position={[0,5.1,0]}>
      <mesh geometry={crystal}><meshPhysicalMaterial color="#d0e8df" metalness={.03} roughness={.06} transmission={.92} thickness={.4} ior={1.46} transparent opacity={.55} depthWrite={false} /></mesh>
      <lineSegments geometry={edges}><lineBasicMaterial color="#b5e9db" transparent opacity={.65} /></lineSegments>
    </group>
    <mesh position={[0,.88,0]} scale={[1,.6,1]}><sphereGeometry args={[1.25,48,24,0,Math.PI*2,Math.PI/2,Math.PI/2]} /><meshPhysicalMaterial color="#8fc7ba" transmission={.8} roughness={.12} thickness={.08} transparent opacity={.5} depthWrite={false} /></mesh>
    <points ref={steam} geometry={geometry}><pointsMaterial size={.075} color="#fff2dc" transparent opacity={reduced?0:.11} depthWrite={false} /></points>
    {codex && <mesh ref={pen} position={[codex[0],1.28,codex[1]+.65]}><cylinderGeometry args={[.035,.014,.48,12]} /><meshStandardMaterial color={HOME_BRASS} metalness={.6} roughness={.3} /></mesh>}
  </>
}

function GreenhouseGlass() {
  const geometry=useMemo(()=>{
    const p:number[]=[],uv:number[]=[],ids:number[]=[]
    const columns=96,rows=28
    for(let j=0;j<=rows;j++) for(let i=0;i<=columns;i++) {
      const a=.94+i/columns*(Math.PI*2-1.88),t=j/rows*Math.PI/2,r=16.60*Math.cos(t)
      p.push(Math.sin(a)*r,1+11.5*Math.sin(t),Math.cos(a)*r-1);uv.push(i/columns,j/rows)
      if(i<columns&&j<rows){const k=j*(columns+1)+i;ids.push(k,k+1,k+columns+1,k+1,k+columns+2,k+columns+1)}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ids);g.computeVertexNormals();return g
  },[])
  const material=useMemo(()=>{
    const mat=new THREE.MeshPhysicalMaterial({color:'#d3ddd8',transparent:true,opacity:.22,roughness:.09,metalness:0,clearcoat:1,clearcoatRoughness:.08,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:1.15})
    mat.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 homePaneUv;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nhomePaneUv=uv;')
      shader.fragmentShader='varying vec2 homePaneUv;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec2 pane=fract(homePaneUv*vec2(29.,5.));
        float frame=1.-smoothstep(.0,.075,min(min(pane.x,1.-pane.x),min(pane.y,1.-pane.y)));
        diffuseColor.a*=.56+.44*frame;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.96,.94,.85),frame*.12);`)
    }
    mat.customProgramCacheKey=()=> 'kywai-window-panes'
    return mat
  },[])
  useEffect(()=>()=>{geometry.dispose();material.dispose()},[geometry,material])
  return <mesh geometry={geometry} material={material} renderOrder={3} />
}

function SharedTable() {
  const resources=useMemo(()=>{
    const stone=surfaceMaps('limestone'),wood=surfaceMaps('oak')
    const stoneGeo=new THREE.LatheGeometry([[2.8,.06],[3.54,.06],[3.60,.12],[3.60,.85],[3.70,.90],[3.72,.94],[3.72,1.0],[3.67,1.04],[3.5,1.04],[3.5,.95],[2.4,.95],[2.4,.87],[2.8,.87],[2.8,.06]].map(([x,y])=>new THREE.Vector2(x,y)),160)
    const woodGeo=new THREE.LatheGeometry([[2.42,.95],[3.5,.95],[3.5,1.035],[2.42,1.035],[2.42,.95]].map(([x,y])=>new THREE.Vector2(x,y)),160)
    return {stone,wood,stoneGeo,woodGeo}
  },[])
  useEffect(()=>()=>{Object.values(resources.stone).forEach(t=>t.dispose());Object.values(resources.wood).forEach(t=>t.dispose());resources.stoneGeo.dispose();resources.woodGeo.dispose()},[resources])
  return <group onClick={e=>{e.stopPropagation();useCowork.getState().cameraCommand({type:'focus',x:0,z:0})}}>
    <mesh geometry={resources.stoneGeo} receiveShadow castShadow><meshStandardMaterial color="#e4d1b0" {...resources.stone} roughness={.7} metalness={.01} /></mesh>
    <mesh geometry={resources.woodGeo} receiveShadow><meshStandardMaterial color={HOME_WOOD} {...resources.wood} roughness={.64} metalness={.02} /></mesh>
    <mesh position={[0,.87,0]} rotation-x={-Math.PI/2}><circleGeometry args={[1.23,96]} /><meshPhysicalMaterial color="#7db6a7" transparent opacity={.38} roughness={.12} metalness={.05} clearcoat={1} /></mesh>
  </group>
}

function MemoryOrb({ reduced }: { reduced:boolean }) {
  const ref=useRef<THREE.Group>(null!)
  const lines=useMemo(()=>Array.from({length:7},(_,i)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({length:81},(_,j)=>{
    const a=j/80*Math.PI*2;return new THREE.Vector3(Math.cos(a)*.65,Math.sin(a)*.65*Math.cos(i*.9),Math.sin(a)*.65*Math.sin(i*.9))
  })),80,.008,5,false)),[])
  useEffect(()=>()=>lines.forEach(g=>g.dispose()),[lines])
  useFrame(()=>{ref.current.rotation.y=reduced?0:registry.time*.07})
  return <group position={[11.3,6.7,-6.8]} onClick={e=>{e.stopPropagation();useCowork.getState().setLeftTab('memory');useCowork.getState().setMobileView('chat')}}>
    <group ref={ref}>{lines.map((g,i)=><mesh key={i} geometry={g}><meshStandardMaterial color="#e3b46d" emissive="#f4cc87" emissiveIntensity={.9} roughness={.3} metalness={.5} /></mesh>)}</group>
    <mesh><sphereGeometry args={[.67,32,20]} /><meshPhysicalMaterial color="#ece1cd" transparent opacity={.10} roughness={.1} clearcoat={1} depthWrite={false} /></mesh>
    <pointLight intensity={3} color="#ffc575" distance={5} />
  </group>
}

export function KywaiHome({ stations, detailed, reduced }: { stations:StationConfig[];detailed:boolean;reduced:boolean }) {
  const night=useHomeNight()
  const agents=useData(d=>d.agents)
  const byStation=useMemo(()=>Object.fromEntries(Object.values(agents).map(a=>[a.stationId,a])),[agents])
  const pieces=useMemo(()=>[...kywaiArchitecture(stations,detailed),...homeComfortParts(stations),...homeProps(stations,Object.fromEntries(Object.values(agents).map(a=>[a.stationId,`${a.name} ${a.id}`])))],[stations,agents,detailed])
  const veins=useMemo(()=>stations.filter(s=>homeRole(`${byStation[s.id]?.name??''} ${byStation[s.id]?.id??''}`)!=='hermes').map(s=>{
    const [x,z]=s.position,len=Math.hypot(x,z),a=new THREE.Vector3(x,0,z).multiplyScalar(3.8/Math.max(3.8,len))
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a,new THREE.Vector3(x*.55,.015,z*.55+.3),new THREE.Vector3(x,.015,z+.8)]),40,.018,6,false)
  }),[stations,byStation])
  useEffect(()=>()=>veins.forEach(g=>g.dispose()),[veins])
  const codex=stations.find(s=>homeRole(`${byStation[s.id]?.name??''} ${byStation[s.id]?.id??''}`)==='codex')?.position
  return <group name="kywai-observatory-home">
    <HomeSkyDome reduced={reduced} />
    <HomeOcean reduced={reduced} />
    <KywaiCoast detailed={detailed} reduced={reduced} />
    <WorldModel pieces={pieces} style="kywai" />
    <SharedTable />
    <HomeComfort />
    <GreenhouseGlass />
    <MemoryOrb reduced={reduced} />
    {veins.map((g,i)=><mesh key={i} geometry={g}><meshStandardMaterial color="#54bab1" emissive="#54bab1" emissiveIntensity={night?.25:.55} roughness={.3} /></mesh>)}
    {stations.map(s=>{
      const name=byStation[s.id]?.name??s.label,[x,z]=s.position,role=homeRole(`${name} ${byStation[s.id]?.id??''}`)
      return <group key={s.id}>
        {role==='claude' && <mesh position={[x-1,1.7,z-.6]} onClick={e=>{e.stopPropagation();const state=useCowork.getState();state.setLeftTab('files');state.setMobileView('chat')}}><boxGeometry args={[1.8,2.7,.7]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>}
        <HomeNameplate text={name} station={s} />
        {['qwen','kilo','copilot'].includes(role??'') && <Screen x={x+.65} z={z} route={role==='copilot'} />}
      </group>
    })}
    <HomeEffects reduced={reduced} codex={codex} />
    {([[-13,5,-4],[13,5,-4],[-9,6,-12],[9,6,-12]] as Vec[]).map((at,i)=><Lantern key={i} at={at} seed={i} reduced={reduced} />)}
    <Plaque text="kywai" at={[0,.035,13.2]} width={3.2} tilt={-Math.PI/2} />
    <group onClick={e=>{e.stopPropagation();const s=useCowork.getState();s.setLeftTab('chat');s.setMobileView('chat')}}>
      <Plaque text={t('¿Qué creamos hoy?')} at={[7,1.445,11.45]} width={2.2} tilt={-Math.PI/2+.2} />
    </group>
  </group>
}
