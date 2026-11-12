import type { StationConfig } from '@shared/types'
import type { Model, Vec, WorldStyle } from './models'
import { addRelicSanctuary } from './relicSanctuary'
import { weaveAnchors } from './crystalThreads'

const rnd = (i: number) => { const n = Math.sin(i * 127.1 + 31.7) * 43758.5453; return n - Math.floor(n) }

export const HERITAGE_WORLDS = ['relicario', 'telar', 'halloween', 'navidad'] as const
export const villageHomes: [number, number, number, number][] = [
  ...Array.from({ length: 9 }, (_, i) => [(i - 4) * 4.7, -19 - Math.abs(i - 4) * .48, .95 + rnd(i) * .22, i] as [number, number, number, number]),
  ...[-1, 1].flatMap(s => Array.from({ length: 3 }, (_, i) => [s * (19 + i % 2 * 2), -10 + i * 6, .8, i + 10] as [number, number, number, number]))
]
export const villageChimneys: Vec[] = villageHomes.map(([x,z,s,i]) => [x + .65*s, (3.2+i%2)*s + 1.8*s, z-.7*s])
const gold = '#b99a60', silver = '#aab6cd', stone = '#383546', wood = '#644b40'

function pillar(m: Model, x: number, z: number, h: number, dark = false) {
  const c = dark ? '#202330' : stone
  for (const [y, w, d] of [[.08, .85, .16], [.25, .65, .18], [h - .1, .68, .2]] as const) m.box([x, y, z], [w, d, w], c)
  m.add('cylinder', [x, h / 2, z], [.31, h - .4, .31], c)
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2
    m.beam([x + Math.cos(a) * .315, .4, z + Math.sin(a) * .315], [x + Math.cos(a) * .315, h - .3, z + Math.sin(a) * .315], .015, gold)
  }
  for (const y of [.37, h - .3]) m.ring([x, y, z], .29, gold, undefined, .05)
}

function floor(m: Model, style: WorldStyle) {
  const winter = style === 'navidad', relic = style === 'relicario', loom = style === 'telar'
  if (loom) return
  else m.box([0, -.45, -7], [64, .3, 64], winter ? '#b5cad8' : relic ? '#101c2a' : '#171725')
  const size = relic || loom ? 1.5 : .88
  for (let x = -15; x <= 15; x += size) for (let z = -18; z <= 12; z += size) {
    if (Math.hypot(x / 16, (z + 2) / 16) > 1) continue
    const shade = Math.floor(rnd(x * 13 + z * 19) * 3)
    const colors = winter ? ['#717b89', '#89939f', '#9ea9b5'] : relic ? ['#25313c', '#1e2835', '#303a45'] : loom ? ['#252b43', '#31334a', '#22283c'] : ['#43404c', '#353540', '#4b4550']
    m.box([x + (winter || style === 'halloween' ? (Math.round(z / size) % 2) * size * .5 : 0), -.21 + rnd(x * 9 + z) * .018, z], [size - .035, .14, size * .97], colors[shade])
    if ((relic || loom) && Math.round((x + 15) / size) % 3 === 0) m.box([x - size / 2, -.13, z], [.014, .015, size], relic ? gold : silver)
  }
  if (relic) for (const side of [-1, 1]) {
    m.box([side * 17, -.13, -4], [3.4, .06, 34], '#32687c')
    for (const dx of [-1.8, 1.8]) m.box([side * 17 + dx, -.12, -4], [.16, .3, 34], '#202330')
  }
  for (const r of [3, 3.16, 8.5, 14.3]) m.add('inlayRing', [0, -.115, -1], [r,r,r], relic ? gold : loom ? silver : '#777381', relic || loom ? .13 : 0, [Math.PI/2,0,0])
}

function crystal(m: Model, x: number, y: number, z: number, s: number) {
  m.add('crystal', [x, y + s * .65, z], [s * .28, s * 1.3, s * .28], '#b7d6e3', .12, [0, x, -.12])
  for (let i = 0; i < 4; i++) {
    const a = i * 2.4
    m.add('crystal', [x + Math.sin(a) * s * .28, y + s * .31, z + Math.cos(a) * s * .28], [s * .14, s * .65, s * .14], '#8daebb', .09, [.1, a, Math.sin(a) * .3])
  }
}

function crystallineAnchors(m: Model) {
  for (const [x,y,z] of weaveAnchors) m.add('crystal',[x,y,z],[.08,.19,.08],'#c4dce9',.08)
}

function lancet(m: Model, x: number, y: number, z: number, w: number, h: number) {
  m.box([x, y + h * .38, z], [w, h * .76, .09], '#edb672', .6)
  m.add('pointedArch', [x, y + h * .74, z + .05], [w * .55, h * .35, .16], '#736779')
  for (const s of [-1, 1]) m.box([x + s * w * .56, y + h * .38, z + .08], [.1, h * .83, .17], '#736779')
  m.box([x, y + h * .4, z + .14], [.06, h * .8, .08], '#282532')
  for (const dy of [.25, .55]) m.box([x, y + h * dy, z + .14], [w, .055, .08], '#282532')
}

function haunted(m: Model) {
  const z = -19
  // Masonry, buttresses, slate roof courses and a tracery rose window.
  m.box([0, 3.5, z], [10, 7, 6], '#343341')
  m.add('gable', [0,7,z+3.02], [10,2.65,.16], '#514957')
  for (const s of [-1, 1]) {
    m.box([s * 6, 4.6, z + .3], [2.8, 9.2, 4.2], '#363342')
    for (let y = .4; y < 9; y += 1.3) m.box([s * 6, y, z + 2.46], [3, .16, .2], '#59505d')
    for (let x = -1; x <= 1; x++) m.add('cone', [s * 6 + x * .9, 10.4, z + .3], [.45, 2.7, .45], '#232532')
    lancet(m, s * 6, 6.3, z + 2.45, .7, 1.6)
    for (let zz = -21; zz <= -16; zz += 2.5) {
      m.box([s * 5.25, 2.3, zz], [.55, 4.6, .65], '#514957')
      m.beam([s * 5.25, 5.8, zz], [s * 7, .1, zz], .26, '#514957', 'box')
    }
  }
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) {
    m.box([s * (i + .5) * .51, 9.6 - i * .27, z], [.7, .17, 6.8], i % 2 ? '#353545' : '#2b2e3d', 0, [0, 0, -s * .48])
  }
  m.box([0, 1.7, z + 3.06], [2, 3.4, .12], '#171720')
  m.add('pointedArch', [0, 2.7, z + 3.18], [1.2, 2, .28], '#736779')
  for (const x of [-3.3, 3.3]) lancet(m, x, 1.9, z + 3.1, .9, 3)
  for (const r of [1.2, 1.36]) m.ring([0, 6.1, z + 3.18], r, '#b8a18a', [0, 0, 0], .05)
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2
    m.ring([Math.sin(a) * .75, 6.1 + Math.cos(a) * .75, z + 3.15], .38, '#bc8772', [0, 0, 0], .25)
  }
  for (let row = 0; row < 17; row++) for (let j = 0; j < 13; j++) {
    const x = -4.6 + j * .75 + row % 2 * .3, y = row * .39 + .2
    if (Math.abs(x) < 1.3 && y < 4.3 || Math.abs(Math.abs(x) - 3.3) < .7 && y < 5.3) continue
    m.box([x, y, z + 3.015], [.69, .34, .07], (row + j) % 3 ? '#514957' : '#655968')
  }
  // Wrought iron cemetery enclosure and lanterns outside the interaction area.
  for (const s of [-1, 1]) for (let zz = -15; zz < 9; zz += .6) {
    m.beam([s * 15.8, -.1, zz], [s * 15.8, 1.5, zz], .028, '#45424c')
    m.add('crystal', [s * 15.8, 1.59, zz], [.08, .23, .08], '#68606b')
    if (Math.round(zz * 10) % 30 === 0) {
      m.beam([s * 15.8, 0, zz], [s * 15.8, 3.6, zz], .075, '#45424c')
      m.box([s * 15.8, 3.35, zz], [.38, .6, .38], '#ffb363', .8)
      m.add('cone', [s * 15.8, 3.84, zz], [.35, .35, .35], '#343341')
    }
  }
  for (const s of [-1, 1]) for (const y of [.5, 1.25]) m.beam([s * 15.8, y, -15], [s * 15.8, y, 9], .035, '#45424c')
  // Con la cámara frontal se ve el borde de delante: la verja sigue por los lados y lo cierra, con una puerta abierta.
  for (const s of [-1, 1]) {
    for (let zz = 9.6; zz <= 14; zz += .6) {
      m.beam([s * 15.8, -.1, zz], [s * 15.8, 1.5, zz], .028, '#45424c')
      m.add('crystal', [s * 15.8, 1.59, zz], [.08, .23, .08], '#68606b')
    }
    for (let xx = 3.4; xx < 15.8; xx += .6) {
      m.beam([s * xx, -.1, 14.2], [s * xx, 1.5, 14.2], .028, '#45424c')
      m.add('crystal', [s * xx, 1.59, 14.2], [.08, .23, .08], '#68606b')
    }
    for (const y of [.5, 1.25]) {
      m.beam([s * 15.8, y, 9], [s * 15.8, y, 14.2], .035, '#45424c')
      m.beam([s * 3, y, 14.2], [s * 15.8, y, 14.2], .035, '#45424c')
    }
    // Pilares de la puerta y faroles en las esquinas, como los de los lados.
    m.box([s * 2.8, 1.1, 14.2], [.5, 2.2, .5], '#4b4550')
    m.box([s * 2.8, 2.27, 14.2], [.62, .14, .62], '#343341')
    m.add('sphere', [s * 2.8, 2.5, 14.2], [.2, .2, .2], '#343341')
    for (const [x, z] of [[s * 2.8, 14.2], [s * 15.8, 14.2], [s * 9.3, 14.2]] as const) {
      m.beam([x, 0, z + .01], [x, 3.6, z + .01], .075, '#45424c')
      m.box([x, 3.35, z + .01], [.38, .6, .38], '#ffb363', .8)
      m.add('cone', [x, 3.84, z + .01], [.35, .35, .35], '#343341')
    }
    for (let k = 0; k < 7; k++) {
      // Lápidas torcidas entre la verja y la plaza.
      const x = s * (5.2 + k * 1.45), z = 15.3 + rnd(k * 3 + (s > 0 ? 7 : 0)) * 1.1
      const h = .55 + rnd(k + 9) * .4, yaw = (rnd(k) - .5) * .5, lean = (rnd(k + 4) - .5) * .22, stone = k % 2 ? '#5d5764' : '#4b4550'
      // Lápida de remate redondo, un poco hundida y torcida, con su losa delante.
      m.box([x, h / 2 - .05, z], [.62, h, .16], stone, 0, [0, yaw, lean])
      m.add('cylinder', [x - Math.sin(lean) * h, h - .05, z], [.31, .16, .31], stone, 0, [Math.PI / 2, 0, yaw])
      m.box([x - Math.sin(lean) * h * .5, h * .55, z + .085], [.36, .035, .02], '#7d7686', 0, [0, yaw, lean])
      m.box([x, .02, z + .45], [.6, .07, .75], '#2f2a34', 0, [0, yaw, 0])
    }
  }

}

function chalet(m: Model, x: number, z: number, s: number, i: number) {
  const w = 3 * s, h = (3.2 + i % 2) * s, d = 3.7 * s
  const plaster = i % 3 === 0 ? '#b8a38c' : i % 3 === 1 ? '#879b98' : '#a48579'
  m.box([x, h / 2, z], [w, h, d], plaster)
  for (const side of [-1, 1]) for (const dz of [-1, 1]) m.box([x + side * w * .48, h / 2, z + dz * d * .49], [.16 * s, h, .14 * s], wood)
  for (const y of [.3, h * .53, h]) m.box([x, y, z + d / 2 + .03], [w, .15 * s, .15 * s], wood)
  m.add('gable', [x, h, z + d / 2], [w, w * .42, .12], plaster)
  for (const side of [-1, 1]) {
    const roofX = x + side * w * .27, roofY = h + w * .22
    m.box([roofX, roofY, z], [w * .67, .19 * s, d + .6 * s], '#73636b', 0, [0, 0, -side * .63])
    m.box([roofX, roofY + .12 * s, z], [w * .69, .18 * s, d + .65 * s], '#dae5e8', 0, [0, 0, -side * .63])
    for (let j = 0; j < 9; j++) m.add('cone', [x + side * w * .53, h - .02 - rnd(i * 18 + j) * .13, z - d / 2 + j / 8 * d], [.04 * s, (.15 + rnd(j) * .35) * s, .04 * s], '#d1e6ed', 0, [Math.PI, 0, 0])
  }
  m.box([x + .65 * s, h + 1.05 * s, z - .7 * s], [.5 * s, 1.2 * s, .55 * s], '#795b57')
  m.box([x + .65 * s, h + 1.68 * s, z - .7 * s], [.66 * s, .15 * s, .7 * s], '#dce4e6')
  for (const sx of [-1, 1]) for (const y of [h * .3, h * .76]) {
    const wx = x + sx * w * .28, wz = z + d / 2 + .09
    m.box([wx, y, wz], [.6 * s, .85 * s, .07], '#ffce86', .65)
    for (const dx of [-.38, .38]) m.box([wx + dx * s, y, wz + .05], [.15 * s, .96 * s, .12], i % 2 ? '#385849' : '#794c4d')
    m.box([wx, y, wz + .07], [.04, .88 * s, .06], wood)
    m.box([wx, y, wz + .07], [.6 * s, .04, .06], wood)
    m.box([wx, y - .5 * s, wz + .16], [.95 * s, .12 * s, .35 * s], '#dce4e6')
  }
  for (let j=0;j<7;j++) m.box([x-w*.43+j*w*.145,.14,z+d/2+.04],[w*.13,.24,.14],'#8a8381')
  for (const side of [-1,1]) for(let k=0;k<7;k++) m.box([x+side*(k+.5)*w/14,h+w*.42-(k+.5)*w*.06,z+d/2+.22],[w/12,.045,.11],'#e0e9eb',0,[0,0,-side*.63])
  m.box([x, .8 * s, z + d / 2 + .07], [.68 * s, 1.6 * s, .12], '#4d3734')
  m.ring([x, 1.05 * s, z + d / 2 + .17], .24 * s, '#3d694a', [0, 0, 0], 0)
  for (let j = 0; j < 17; j++) {
    const dx = (j / 16 - .5) * w * 1.08
    m.add('sphere', [x + dx, h - .12 - Math.sin(j / 16 * Math.PI) * .18, z + d / 2 + .32], [.045, .06, .045], j % 4 === 0 ? '#df6b5c' : '#ffdd9a', 1)
  }
}

function winterVillage(m: Model) {
  for (const [x,z,s,i] of villageHomes) chalet(m,x,z,s,i)
  for (const side of [-1, 1]) {
    for (let z = -12; z <= 9; z += 5) {
      const x = side * 14
      m.add('cylinder', [x, 1.5, z], [.07, 3.2, .07], '#34464c')
      m.box([x, 3.1, z], [.37, .54, .37], '#ffce86', .8)
      m.add('cone', [x, 3.52, z], [.34, .3, .34], '#dbe6e8')
      m.ring([x, 2.6, z + .1], .34, '#3d694a', [0, 0, 0], 0)
    }
    for (let i = 0; i < 35; i++) {
      const x = side * (14 + rnd(i + 14) * 3), z = -16 + rnd(i + 33) * 29
      m.add('sphere', [x, -.18, z], [.6 + rnd(i), .2, .5 + rnd(i + 2)], '#d4e2e7')
    }
    // El frente del pueblo: farolas como las de los lados, también en las esquinas de delante.
    for (const x of [side * 8, side * 14]) {
      m.add('cylinder', [x, 1.5, 13.5], [.07, 3.2, .07], '#34464c')
      m.box([x, 3.1, 13.5], [.37, .54, .37], '#ffce86', .8)
      m.add('cone', [x, 3.52, 13.5], [.34, .3, .34], '#dbe6e8')
      m.ring([x, 2.6, 13.6], .34, '#3d694a', [0, 0, 0], 0)
    }
  }
}

export function addHeritageWorld(m: Model, style: WorldStyle, _stations: StationConfig[], detailed: boolean) {
  floor(m, style)
  if (style === 'relicario') addRelicSanctuary(m, detailed)
  if (style === 'telar') crystallineAnchors(m)
  if (style === 'halloween') haunted(m)
  if (style === 'navidad') winterVillage(m)
}

/** The original crystal, woven ribbons, pumpkin and snow globe sit in crafted mounts. */
export function addHeritageCore(m: Model, style: WorldStyle) {
  const c = style === 'telar' ? silver : gold
  if (style === 'relicario' || style === 'navidad') {
    for (const [y,r] of [[.34,2.1],[.43,2.02],[.51,1.94]] as const) {
      m.add('cylinder',[0,y,0],[r,.07,r],style === 'navidad' ? wood : '#202330')
      m.ring([0,y+.04,0],r,c,undefined,.09)
    }
    for(let i=0;i<48;i++) {
      const a=i/48*Math.PI*2
      m.add('crystal',[Math.sin(a)*2.04,.39,Math.cos(a)*2.04],[.023,.09,.043],c,.03,[0,a,Math.PI/2])
    }
  }
  if (style === 'relicario') for(let i=0;i<4;i++) {
    const a=i*Math.PI/2+Math.PI/4
    let previous: Vec=[Math.sin(a)*2.15,.35,Math.cos(a)*2.15]
    for(let k=1;k<=18;k++) {
      const t=k/18, r=2.15+Math.sin(t*Math.PI)*.15-t*.75
      const point: Vec=[Math.sin(a)*r,.35+t*2.45,Math.cos(a)*r]
      m.beam(previous,point,.035,c); previous=point
    }
    m.add('sphere',previous,[.1,.1,.1],'#b7d6e3',.12)
  }
  if(style === 'telar') {
    for(let i=0;i<24;i++) {
      const a=i*Math.PI/12
      m.add('sphere',[Math.sin(a)*2.2,-.12,Math.cos(a)*2.2],[.025,.025,.025],silver,.4)
    }
  }
  if(style === 'halloween') for(let i=0;i<6;i++) {
    const a=i*Math.PI/3
    let previous:Vec=[Math.sin(a)*1.1,.36,Math.cos(a)*1.1]
    for(let j=1;j<=24;j++) {
      const t=j/24, r=1.1+t*1.8, b=a+t*1.5
      const p:Vec=[Math.sin(b)*r,.38+Math.sin(t*Math.PI)*.12,Math.cos(b)*r]
      m.beam(previous,p,.025,'#68764a');previous=p
      if(j%5===0) m.add('leaf',[p[0],p[1]+.07,p[2]],[.15,.28,.09],'#68764a',0,[-Math.PI/2,b,0])
    }
  }
}
