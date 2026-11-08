import * as THREE from 'three'
import { Model, type Vec } from './models'
import type { StationConfig } from '@shared/types'
import { homePlant } from './homeBotany'
import { homeSlot } from './homeLayout'

export const HOME_WOOD = '#b88754', HOME_STONE = '#e4d1b0', HOME_BRASS = '#b99a60'
const leaves = ['#557550', '#78935e', '#94a575', '#426c51']
const random = (i: number) => { const n = Math.sin(i * 127.1 + 42.3) * 43758.5453; return n - Math.floor(n) }
const polar = (a: number, r: number, y: number): Vec => [Math.sin(a) * r, y, Math.cos(a) * r - 1]

export const addHomePlant = homePlant

/** All small parts share meshes/materials through the existing instance renderer. */
export function kywaiArchitecture(stations: StationConfig[], detail: boolean) {
  const m = new Model(), wood = HOME_WOOD, stone = HOME_STONE, brass = HOME_BRASS
  m.add('cylinder', [0, -.42, -1], [17.2, .7, 17.2], stone)
  m.add('cylinder', [0, -.84, -1], [17.6, .18, 17.6], '#b59e80')
  m.ring([0, -.04, -1], 16.9, brass, undefined, 0)
  // Staggered limestone courses, with subtle color variation instead of a square grid.
  for(let row=0;row<33;row++) for(let col=0;col<18;col++) {
    const x=-17+col*2+(row%2),z=-17+row
    if(Math.hypot(x,z+1)>16.15) continue
    m.box([x,-.045,z],[1.986,.035,.986],['#ead9be','#e7d5b6','#e2ceb0'][Math.floor(random(row*13+col)*3)])
  }
  // Bonded stone foundations anchor the house to the coastal garden.
  for(let row=0;row<3;row++) for(let i=0;i<106;i++) {
    const a=(i+(row%2)*.5)/106*Math.PI*2,p=polar(a,17.12,-.3-row*.42)
    m.box(p,[1.03,.405,.50],row%2?'#d0bea3':'#c4b091',0,[0,a,0])
  }
  // Front is cut away, as in the reference. The remaining ribs form a real vaulted greenhouse.
  for (let i = 0; i < 11; i++) {
    const a = .94 + i / 10 * (Math.PI * 2 - 1.88)
    m.add('homeRib',[0,0,-1],[1,1,1],wood,0,[0,a-Math.PI/2,0])
    const p = polar(a, 16.65, .6)
    m.add('cylinder', p, [.33, 1.2, .33], stone)
    m.box([p[0],.14,p[2]],[.90,.26,.85],stone,0,[0,a,0])
    m.box([p[0],1.03,p[2]],[.6,.16,.6],brass,0,[0,a,0])
    for (let j = 0; j < 5; j++) {
      const t = j * .26 + .08, r = 16.65 * Math.cos(t), y = 1 + 11.5 * Math.sin(t)
      const at=polar(a,r+.04,y),normal=new THREE.Vector3(Math.sin(a)*Math.cos(t),Math.sin(t),Math.cos(a)*Math.cos(t)).normalize()
      const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal)
      m.pieces.push({shape:'box',at,size:[.48,.42,.055],color:brass,quaternion:q})
      for(const dx of [-.16,.16]) for(const dy of [-.13,.13]) {
        const bolt=new THREE.Vector3(dx,dy,.045).applyQuaternion(q).add(new THREE.Vector3(...at))
        m.add('sphere',bolt.toArray() as Vec,[.029,.029,.024],brass)
      }

    }
  }
  for (const t of [.05, .30, .58, .88, 1.18]) {
    for (let j = 0; j < 110; j++) {
      const a = .94 + j / 110 * (Math.PI * 2 - 1.88), b = .94 + (j + 1) / 110 * (Math.PI * 2 - 1.88)
      m.beam(polar(a, 16.65 * Math.cos(t), 1 + 11.5 * Math.sin(t)), polar(b, 16.65 * Math.cos(t), 1 + 11.5 * Math.sin(t)), .045, brass)
    }
  }
  // Fine window mullions follow the dome's curvature; oak remains the primary structure.
  for(let i=0;i<29;i++) {
    const a=.96+i/28*(Math.PI*2-1.92)
    m.add('homeMullion',[0,0,-1],[1,1,1],wood,0,[0,a-Math.PI/2,0])
  }
  // Curved planted perimeter and bay seating, with timber slats and upholstered pads.
  for (let i = 0; i < 74; i++) {
    const a = .88 + i / 73 * (Math.PI * 2 - 1.76), p = polar(a, 15.65, .38)
    m.box(p, [1.15, .78, .75], stone, 0, [0, a, 0])
    const b = polar(a, 15.65, .82)
    m.box(b, [1.16, .08, .8], '#bda989', 0, [0, a, 0])
    if (i % 2 === 0) addHomePlant(m, b[0], .88, b[2], 500 + i * 20, 1.5 + random(i) * .7, detail ? 85 : 35)
    if(i%3===0) for(let j=0;j<8;j++) {
      const x=b[0]+(random(i+j*23)-.5)*.75,z=b[2]+(random(i+j*31)-.5)*.55,h=.35+random(i+j)*.3
      m.beam([x,.9,z],[x,.9+h,z],.008,'#718358')
      for(let k=0;k<5;k++) m.add('sphere',[x,.9+h+k*.035,z],[.035,.047,.035],j%2?'#a591bd':'#c6accf')
    }
    if (i > 8 && i < 23) {
      for (let step = 0; step < 2; step++) {
        const bench = polar(a, 14.65 - step * .8, .6 - step * .2)
        m.box(bench, [.95, .27, .8], stone, 0, [0, a, 0])
        if (i % 3 === 0) m.box([bench[0], bench[1] + .2, bench[2]], [.75, .18, .64], '#8fa7a0', 0, [0, a, 0])
      }
    }
  }
  // Vines climb the side ribs, not the work area.
  for (const a of [1.03, 1.48, 4.8, 5.25]) for (let j = 0; j < 80; j++) {
    const t = j / 80 * 1.1, p = polar(a + Math.sin(j * .7) * .025, 16.5 * Math.cos(t), 1.1 + 11.5 * Math.sin(t))
    m.add('leaf', p, [.20, .40, .15], leaves[j % 4], 0, [j * .6, a, .6])
  }
  // Carpentry varies with the kind of work: cabinets, open benches and a paired desk.
  for(const st of stations) {
    const [x,z]=st.position
    const role=homeSlot(st.position)
    if(role==='hermes') continue
    const rectangular=['aider','kilo','copilot','codex'].includes(role??''),base=z>5?1.75:1.55
    if(rectangular) {
      const w=role==='copilot'?3.7:3.3
      for(const dx of [-w*.41,w*.41]) for(const dz of [-.12,1.33]) {
        m.add('cylinder',[x+dx,.39,z+dz],[.072,.72,.072],wood)
        m.add('sphere',[x+dx,.08,z+dz],[.115,.08,.115],wood)
        m.add('cylinder',[x+dx,.18,z+dz],[.095,.055,.095],brass)
      }
      m.box([x,.24,z+.6],[w-.18,.10,1.55],wood)
      m.box([x,.78,z+.64],[w,.28,1.77],wood)
      m.box([x,.965,z+.64],[w+.10,.12,1.87],'#d0ae7c')
      for(let j=0;j<3;j++) {
        const xx=x+(j-1)*w*.31
        m.box([xx,.78,z+1.55],[w*.285,.20,.07],'#8e623f')
        m.box([xx,.79,z+1.596],[w*.25,.13,.035],wood)
        if(j!==1) m.beam([xx-.11,.8,z+1.64],[xx+.11,.8,z+1.64],.018,brass)
      }
      for(let j=0;j<5;j++) m.box([x-1+j*.35,.36,z+.7],[.28,.15,.5],['#bba17b','#8fa7a0','#d1b28a'][j%3])
    } else {
      m.add('cylinder',[x,.4,z+.67],[base,.72,1.08],wood)
      m.add('cylinder',[x,.83,z+.67],[base+.12,.13,1.19],stone)
      m.add('cylinder',[x,.92,z+.67],[base+.04,.07,1.11],'#c69b65')
      m.add('cylinder',[x,.97,z+.67],[base-.03,.035,1.06],wood)
      for(let j=0;j<9;j++) {
        const a=.12+j/8*(Math.PI-.24),normal:Vec=[Math.cos(a),0,Math.sin(a)],yaw=Math.PI/2-a
        const p:Vec=[x+Math.cos(a)*base,.42,z+.67+Math.sin(a)*1.08]
        m.box(p,[.50,.51,.055],'#8e623f',0,[0,yaw,0])
        m.box([p[0]+normal[0]*.035,p[1],p[2]+normal[2]*.035],[.40,.38,.035],wood,0,[0,yaw,0])
        for(const dy of [-.24,.24]) m.box([p[0]+normal[0]*.055,p[1]+dy,p[2]+normal[2]*.055],[.49,.025,.025],'#d0ae7c',0,[0,yaw,0])
      }
      m.add('cylinder',[x,.08,z+.67],[base+.025,.08,1.11],brass)
    }
    // A woven rug, stitched border and short fringe ground each work nook.
    const rug=role==='muse'?'#9b829e':role==='gemini'?'#8fa7a0':role==='claude'?'#b8a590':'#c9ba9e'
    m.box([x,.014,z+.45],[4.35,.026,3.35],rug)
    for(const dx of [-2.02,2.02]) m.box([x+dx,.031,z+.45],[.06,.009,3.10],'#d1b28a')
    for(const dz of [-1.06,1.96]) m.box([x,.031,z+dz],[4.04,.009,.06],'#d1b28a')
    for(let j=0;j<20;j++) for(const side of [-1,1]) m.beam([x-2+j*.21,.022,z+.45+side*1.67],[x-2+j*.21,.022,z+.45+side*1.79],.006,'#c9ba9e')
    for(const dx of [-.65,.65]) {
      m.box([x+dx,1.055,z+1.13],[.51,.035,.57],'#f5ead4',0,[.05,dx*.25,0])
      for(let k=0;k<5;k++) m.box([x+dx,1.082,z+.95+k*.07],[.34,.005,.009],'#a5a08f')
    }
  }
  // The shared table is rendered as continuous lathed stone and oak in KywaiHome.
  m.ring([0, .91, 0], 2.42, brass, undefined, 0)
  m.add('cylinder', [0, .22, 0], [1.35, .16, 1.35], '#6da79d')
  // The user's upholstered chair is constructed separately with a curved back and draped throw.
  m.box([0,.012,5.7],[3.6,.025,4.5],'#8fa7a0')
  for(const dx of [-1.66,1.66]) m.box([dx,.03,5.7],[.065,.008,4.2],'#d1b28a')
  for(const dz of [3.59,7.81]) m.box([0,.03,dz],[3.32,.008,.065],'#d1b28a')
  // Entry bench and welcome lectern.
  m.box([-7, .60, 12.0], [4.5, .26, 1], wood)
  for (const x of [-8.7, -5.3]) m.box([x, .22, 12], [.22, .6, .7], wood)
  m.box([-7.5, .81, 12], [1.5, .18, .8], '#759b98')
  m.add('planter', [-5.8, .82, 12.0], [.23, .3, .23], '#d1b28a')
  m.add('cylinder',[-5.8,.96,12],[.18,.008,.18],'#614735')
  m.add('cylinder',[-5.8,.665,12],[.32,.035,.32],'#d1b28a')
  m.ring([-5.8, 1, 12], .24, brass, undefined, 0)
  for(const dx of [-.92,.92]) for(const dz of [-.36,.36]) m.box([7+dx,.62,11.6+dz],[.14,1.13,.14],wood,0,[0,0,dx*.07])
  m.box([7,.25,11.6],[2.12,.09,.94],wood)
  m.box([7, 1.28, 11.45], [2.5, .1, 1.5], wood, 0, [.2, 0, 0])
  for (let i = 0; i < 8; i++) addHomePlant(m, (i % 2 ? 1 : -1) * (11.6 + random(i) * 2.1), .1, 11.2 + random(i + 32) * 3, 987 + i * 50, 1.25, detail ? 70 : 32)
  return m.pieces
}
