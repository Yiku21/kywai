import type { StationConfig } from '@shared/types'
import { Model, type Piece, type WorldStyle } from './models'
import { forestRandom } from './forestLayout'

const TAU = Math.PI * 2

/** El perímetro se adapta a los puestos reales, sin ocupar sus accesos ni el centro. */
export function surroundingRadius(stations: StationConfig[]): number {
  return Math.max(24, ...stations.map(s => Math.hypot(...s.position) + 12))
}

/** Arquitectura próxima al patio: conecta el borde existente con un entorno real, sin huecos negros. */
function nearCourt(m: Model, style: WorldStyle, stations: StationConfig[]) {
  const r = Math.max(20, ...stations.map(s => Math.hypot(...s.position) + 9))
  const mechanical = ['eva', 'grafito', 'clasico', 'matrix'].includes(style)
  if (mechanical) {
    const body = style === 'eva' ? '#51445f' : style === 'grafito' ? '#515158' : '#304758'
    const trim = style === 'eva' ? '#a7d94c' : style === 'grafito' ? '#c59a58' : style === 'matrix' ? '#6abf91' : '#8ab4cd'
    // Galería técnica del fondo: pilares con zapatas, paneles y un puente de mantenimiento elevado.
    for (let i = -3; i <= 3; i++) {
      const x = i * r / 3
      m.box([x, 7.5, -r - 6], [1.4, 15, 2.2], body)
      m.box([x, .2, -r - 6], [2.4, 1.7, 3], body)
      m.box([x, 13.6, -r - 4.85], [.12, 2.2, .08], trim, .4)
      if (i < 3) {
        m.box([x + r / 6, 15.4, -r - 6], [r / 3, 1.5, 3], body)
        m.box([x + r / 6, 11, -r - 9], [r / 3 - .25, 5, .6], body)
        m.box([x + r / 6, 13.2, -r - 8.65], [r / 3 - 1, .12, .08], trim, .2)
        for (let y = 9; y < 13; y += .8) m.box([x + r / 6, y, -r - 8.6], [r / 3 - .8, .035, .06], '#78818a')
      }
    }
    for (const side of [-1, 1]) for (let bay = 0; bay < 5; bay++) {
      const z = -r - 2 + bay * 9, h = 14 - bay * 2
      m.box([side * (r + 2), h / 2, z], [1.6, h, 2], body)
      m.box([side * (r + 2), .1, z], [3, 1.5, 3], body)
      m.box([side * (r + 1.12), h * .65, z], [.08, 1.4, .7], trim, .35)
      if (bay < 4) {
        m.beam([side * (r + 2), h, z], [side * (r + 2), h - 2, z + 9], .32, body)
        m.box([side * (r + 2), .6, z + 4.5], [1.5, 1.2, 8.8], body)
      }
    }
    // Carriles y juntas continúan fuera de la plataforma en lugar de terminar en el vacío.
    for (let i = -8; i <= 8; i++) {
      m.box([i * 5, -.655, 10], [.045, .012, 150], '#67717b')
      m.box([0, -.654, i * 5], [150, .012, .045], '#67717b')
    }
    for (const side of [-1, 1]) m.box([side * (r - 3), -.64, 10], [.1, .02, 140], trim, .2)
    return
  }
  // El resto de mapas también gana una transición cercana: no solo un anillo a 50 metros.
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16, x = Math.sin(a) * (r + 2), z = Math.cos(a) * (r + 2)
    const front = z > r * .35
    if (['bosque', 'navidad', 'halloween', 'kywai', 'submarino'].includes(style)) {
      if (style === 'kywai' && z < 0) continue
      const color = style === 'navidad' ? '#c8d4d7' : style === 'submarino' ? '#7caaa1' : '#526747'
      m.add('rock', [x, -.6, z], [3.8, front ? .65 : 1.8, 3], color)
      if (!front && style !== 'submarino') {
        m.add('trunk', [x, 3.7, z], [.5, 7.4, .5], '#716048')
        if (style !== 'halloween') m.add(style === 'navidad' ? 'cone' : 'sphere', [x, 6.3, z], [2.8, 3.2, 2.8], style === 'navidad' ? '#e0e8e5' : '#45694b')
      }
    } else if (style === 'orbita') {
      m.box([x, -.6, z], [3.2, .45, 5], '#324759')
      m.add('cylinder', [x, .8, z], [.65, 2.8, .65], '#708b9b', 0, [Math.PI / 2, a, 0])
    } else if (style === 'telar') {
      m.add('rock', [x, -1.4, z], [3, .9, 2.7], '#526783')
      m.add('crystal', [x, front ? .7 : 2.8, z], [.8, front ? 1.3 : 4, 1], '#8daebb')
    } else {
      const color = style === 'marfil' ? '#d7cdb8' : '#788992'
      m.box([x, -.5, z], [5.4, .6, 4], color)
      if (!front) {
        for (const side of [-1, 1]) m.add('cylinder', [x + side * 2, 3, z], [.32, 6, .32], color)
        m.add('arch', [x, 6, z], [2, 2, 1], color)
      }
    }
  }
}

/**
 * Segunda y tercera capas en los 360 grados: las siluetas lejanas permanecen en calidad baja.
 * Los adornos pequeños solo existen en calidad alta/media; todo se agrupa con WorldModel.
 */
export function surroundingModel(style: WorldStyle, stations: StationConfig[], detailed: boolean): Piece[] {
  const m = new Model()
  nearCourt(m, style, stations)
  const radius = surroundingRadius(stations)
  const natural = ['bosque', 'kywai', 'halloween', 'navidad', 'submarino'].includes(style)
  const stone = style === 'marfil' ? '#d7cdb8' : style === 'relicario' ? '#788992' : '#425267'
  for (let layer = 0; layer < 2; layer++) {
    const count = layer ? 24 : 18
    for (let i = 0; i < count; i++) {
      // Semilla por conjunto: cambiar de calidad no desplaza el horizonte.
      const random = forestRandom(7319 + layer * 101 + i * 7919)
      const angle = (i + (layer ? .47 : 0)) / count * TAU
      const r = radius + layer * 23 + random() * 5
      const x = Math.sin(angle) * r, z = Math.cos(angle) * r
      // El primer plano central queda bajo para no tapar al equipo en la vista general.
      const foreground = layer === 0 && z > 0 && Math.abs(x) < radius * .45
      const height = foreground ? 2.4 + random() * 1.4 : 5 + random() * 7 + layer * 3
      const fine = detailed && layer === 0
      if (natural) {
        if (style === 'submarino') {
          // Arrecifes escalonados: bases erosionadas, espolones y corales ramificados.
          m.add('rock', [x, -2.5, z], [4.8, 2.5, 3.8], '#6c8987')
          m.add('rock', [x + .8, .1, z - .6], [2.6, height * .33, 2.1], '#779c97')
          for (let j = 0; j < (fine ? 5 : 2); j++) {
            const cx = x + Math.sin(j * 2.4) * 2.6, cz = z + Math.cos(j * 2.4) * 2.2
            const h = 1.2 + random() * 1.5, color = ['#b58b91', '#a4b697', '#c4a78a'][j % 3]
            m.beam([cx, 0, cz], [cx + .25, h, cz], .10, color)
            for (const side of [-1, 1]) {
              m.beam([cx + .1, h * .55, cz], [cx + side * .6, h * .94, cz + .25], .065, color)
              m.add('sphere', [cx + side * .6, h * .94, cz + .25], [.14, .18, .14], color)
            }
          }
          continue
        }
        if (style === 'kywai' && z < 4) {
          // Islotes bajos en el horizonte marino; los árboles quedan en tierra.
          m.add('rock', [x * 1.5, -5.4, z * 1.5 - 28], [7, 3.4 + random() * 3, 6], '#a6b0aa')
          continue
        }
        const winter = style === 'navidad', haunted = style === 'halloween'
        const wood = haunted ? '#4d3734' : '#716048'
        m.add('rock', [x, -.8, z], [3.4, .9, 2.8], winter ? '#b9c7ce' : '#425546')
        m.add('trunk', [x, height * .43, z], [.6, height * .86, .6], wood)
        // Raíces y ramas conectadas al tronco, con siluetas de varias capas.
        for (let j = 0; j < (fine ? 5 : 3); j++) {
          const a = j / 5 * TAU
          m.beam([x, -.1, z], [x + Math.sin(a) * 1.9, -.5, z + Math.cos(a) * 1.9], .16, wood)
          if (haunted) m.beam([x, height * .5, z], [x + Math.sin(a) * 2, height * .82, z + Math.cos(a) * 2], .18, wood)
        }
        if (!haunted) for (let j = 0; j < 3; j++) {
          const y = height * (.45 + j * .19), w = (3.5 - j * .8) * (layer ? 1.15 : 1)
          m.add(winter ? 'cone' : 'sphere', [x + Math.sin(i + j) * .45, y, z], [w, winter ? height * .4 : height * .22, w * .9], winter ? '#365b51' : ['#355e43', '#496c4b', '#638159'][j])
          if (winter) m.add('cone', [x, y + .2, z], [w * .93, height * .36, w * .84], '#dfe8e8')
        }
        if (haunted && fine) {
          m.box([x + 1.5, .5, z + 1], [.65, 1.3, .28], '#807782', 0, [0, angle, -.1])
          m.add('sphere', [x - 1, .25, z + 1], [.5, .4, .45], '#b87839')
        }
        continue
      }
      if (style === 'orbita') {
        // Módulos presurizados, collares y paneles solares de los muelles exteriores.
        m.add('cylinder', [x, 1.5, z], [1.6, height, 1.6], '#667b89', 0, [Math.PI / 2, 0, 0])
        for (const offset of [-height * .4, height * .4]) m.ring([x, 1.5, z + offset], 1.64, '#90c3d8', [0, 0, 0], .18)
        m.beam([x - 6, 1.5, z], [x + 6, 1.5, z], .16, '#adbfca')
        for (const side of [-1, 1]) {
          m.box([x + side * 4.5, 1.5, z], [4, .12, 5], '#10265a')
          if (fine) for (let j = -2; j <= 2; j++) m.box([x + side * 4.5, 1.58, z + j], [4, .025, .04], '#658cc7')
        }
        continue
      }
      if (style === 'telar') {
        m.add('rock', [x, -3, z], [4, 2, 3], '#526783')
        for (let j = 0; j < 3; j++) m.add('crystal', [x + (j - 1) * 1.9, height * .3, z + j * .4], [1.5 - j * .2, height * (.5 + j * .1), 1.2], ['#8daebb', '#b7d6e3', '#85bac9'][j], 0, [0, angle, .12 * (j - 1)])
        if (fine) m.beam([x - 2, height * .5, z], [x + 2, height * .8, z], .018, '#c4ac78')
        continue
      }
      if (style === 'marfil' || style === 'relicario') {
        // Pabellones abiertos y contrafuertes con volumen desde ambos lados.
        m.box([x, -.5, z], [7, 1, 5], stone)
        for (const side of [-1, 1]) {
          const cx = x + side * 2.5
          m.add('cylinder', [cx, height * .35, z], [.38, height * .7, .38], stone)
          for (const y of [.1, height * .7]) m.add('cylinder', [cx, y, z], [.57, .2, .57], '#c4ac78')
        }
        m.add(style === 'relicario' ? 'pointedArch' : 'arch', [x, height * .7, z], [2.5, 2.5, 1.8], stone)
        if (fine) m.box([x, -.12, z], [5.5, .04, .09], '#b99a60')
        continue
      }
      const industrial = style === 'grafito' || style === 'eva'
      const body = style === 'eva' ? '#41364f' : style === 'matrix' ? '#18382e' : industrial ? '#394149' : '#263c58'
      const accent = style === 'eva' ? '#a6cf60' : style === 'matrix' ? '#61b38b' : industrial ? '#bb8b53' : '#729ebc'
      m.box([x, height * .5 - .7, z], [4.6, height, 4], body)
      m.box([x, -.5, z], [5.3, 1, 4.7], body)
      m.box([x, height - .6, z], [4.9, .28, 4.3], accent)
      if (industrial) {
        m.add('cylinder', [x + 1, height + .5, z], [.65, 3, .65], body)
        for (let j = 0; j < (fine ? 4 : 2); j++) m.ring([x + 1, height + j * .7, z], .68, accent, [Math.PI / 2, 0, 0], .05)
        if (fine) for (const side of [-1, 1]) m.beam([x + side * 2.35, 0, z + 2.1], [x - side * 2.35, height * .75, z + 2.1], .09, accent)
      } else {
        // Las cuatro fachadas llevan detalles, también las que aparecen al girar.
        for (let face = 0; face < 4; face++) for (let floor = 1; floor < (fine ? 6 : 3); floor++) {
          const a = face / 4 * TAU, y = floor / (fine ? 6 : 3) * height
          m.box([x + Math.sin(a) * 2.32, y, z + Math.cos(a) * 2.02], [2.8, .12, .055], accent, .18, [0, a, 0])
        }
      }
    }
  }
  return m.pieces
}
