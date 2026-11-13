import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { hexToHsl, hslToHex, readPptx, resolvePart } from './pptx'

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const rels = (list: [string, string, string][]): string =>
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`).join('')}</Relationships>`

/** Una presentación mínima: patrón con un título arriba, diseño vacío y una diapositiva con título y una forma. */
function deck(): Uint8Array {
  const title = (xfrm: string, text = '') =>
    `<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm}</p:spPr><p:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p>${text}</a:p></p:txBody></p:sp>`
  const files: Record<string, Uint8Array> = {
    '_rels/.rels': strToU8(rels([['rId1', 'officeDocument', 'ppt/presentation.xml']])),
    'ppt/presentation.xml': strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9525000" cy="5715000"/></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(rels([['rId2', 'slide', 'slides/slide1.xml']])),
    'ppt/slides/slide1.xml': strToU8(
      `<p:sld ${NS}><p:cSld><p:spTree>${title('', '<a:r><a:t>Hola</a:t></a:r>')}<p:sp><p:nvSpPr><p:cNvPr id="3" name="F"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="952500" y="952500"/><a:ext cx="1905000" cy="952500"/></a:xfrm><a:prstGeom prst="ellipse"/><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr></a:solidFill></p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr><a:buChar char="&#xF0B7;"/></a:pPr><a:r><a:rPr sz="2400" b="1"/><a:t>Punto</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    ),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']])),
    'ppt/slideLayouts/slideLayout1.xml': strToU8(`<p:sldLayout ${NS}><p:cSld><p:spTree/></p:cSld></p:sldLayout>`),
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': strToU8(rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']])),
    'ppt/slideMasters/slideMaster1.xml': strToU8(
      `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="102030"/></a:solidFill></p:bgPr></p:bg><p:spTree>${title('<a:xfrm><a:off x="0" y="0"/><a:ext cx="9525000" cy="952500"/></a:xfrm>')}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1"/><p:txStyles><p:titleStyle><a:lvl1pPr algn="ctr"><a:defRPr sz="4000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:defRPr></a:lvl1pPr></p:titleStyle></p:txStyles></p:sldMaster>`
    ),
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': strToU8(rels([['rId1', 'theme', '../theme/theme1.xml']])),
    'ppt/theme/theme1.xml': strToU8(`<a:theme ${NS}><a:themeElements><a:clrScheme name="x"><a:accent1><a:srgbClr val="FF0000"/></a:accent1></a:clrScheme><a:fontScheme name="f"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`)
  }
  return zipSync(files)
}

describe('presentaciones en la vista previa', () => {
  it('resuelve las rutas relativas del zip', () => {
    expect(resolvePart('ppt/slides/slide1.xml', '../media/image1.png')).toBe('ppt/media/image1.png')
    expect(resolvePart('ppt/presentation.xml', 'slides/slide2.xml')).toBe('ppt/slides/slide2.xml')
    expect(resolvePart('ppt/presentation.xml', '/ppt/slides/slide2.xml')).toBe('ppt/slides/slide2.xml')
  })

  it('convierte colores entre hex y HSL', () => {
    expect(hslToHex(...hexToHsl('3366cc'))).toBe('3366cc')
  })

  it('lee tamaño, fondo heredado, título colocado como en el patrón y formas con su color de tema', () => {
    const d = readPptx(deck())
    expect(d.width).toBe(1000)
    expect(d.height).toBe(600)
    expect(d.slides).toHaveLength(1)
    const [slide] = d.slides
    expect(slide.background).toBe('#102030')
    const [title, shape] = slide.items
    expect(title).toMatchObject({ kind: 'shape', box: { x: 0, y: 0, w: 1000, h: 100 } })
    if (title.kind !== 'shape' || shape.kind !== 'shape') throw new Error('formas')
    expect(title.text?.anchor).toBe('middle')
    expect(title.text?.paras[0]).toMatchObject({ align: 'center', runs: [{ text: 'Hola', color: '#ffffff' }] })
    expect(title.text?.paras[0].runs[0].size).toBeCloseTo(53.33, 1)
    expect(shape).toMatchObject({ geom: 'ellipse', fill: '#800000', box: { x: 100, y: 100, w: 200, h: 100 } })
    expect(shape.text?.paras[0]).toMatchObject({ bullet: { char: '•' }, runs: [{ text: 'Punto', bold: true }] })
  })

  it('un archivo que no es una presentación da un error claro', () => {
    expect(() => readPptx(zipSync({ 'hola.txt': strToU8('hola') }))).toThrow(/presentation/)
  })
})
