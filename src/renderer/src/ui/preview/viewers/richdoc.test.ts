import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { readEpub, readIwork, readOdf, readRtf } from './richdoc'

describe('más documentos en la vista previa', () => {
  it('RTF: párrafos, negritas, acentos escapados y Unicode, sin las tablas de letras', () => {
    const rtf = String.raw`{\rtf1\ansi\ansicpg1252{\fonttbl{\f0 Arial;}}{\*\generator Prueba;}\pard\qc Hola {\b mundo}\par Caf\'e9 y \u8364? euros\par}`
    const { body } = readRtf(rtf)
    const ps = Array.from(body.querySelectorAll('p'))
    expect(ps.map((p) => p.textContent)).toEqual(['Hola mundo', 'Café y € euros'])
    expect(ps[0].style.textAlign).toBe('center')
    expect(ps[0].querySelector('span')?.style.fontWeight).toBe('700')
    expect(body.textContent).not.toContain('Arial')
    expect(() => readRtf('hola')).toThrow()
  })

  it('OpenDocument: títulos, estilos, listas y tablas', () => {
    const content = `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
<office:automatic-styles><style:style style:name="T1" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles>
<office:body><office:text><text:h text:outline-level="2">Título</text:h><text:p>Uno<text:s text:c="2"/><text:span text:style-name="T1">dos</text:span></text:p>
<text:list><text:list-item><text:p>a</text:p></text:list-item></text:list>
<table:table><table:table-row><table:table-cell table:number-columns-repeated="2"><text:p>x</text:p></table:table-cell><table:table-cell table:number-columns-repeated="1000"/></table:table-row><table:table-row table:number-rows-repeated="5000"><table:table-cell/></table:table-row></table:table></office:text></office:body></office:document-content>`
    const { body } = readOdf(zipSync({ 'content.xml': strToU8(content) }))
    expect(body.querySelector('h2')?.textContent).toBe('Título')
    expect(body.querySelector('p')?.textContent).toBe('Uno  dos')
    expect((body.querySelector('p span') as HTMLElement).style.fontWeight).toBe('700')
    expect(body.querySelector('li')?.textContent).toBe('a')
    // Las columnas y filas vacías repetidas no se pintan.
    expect(body.querySelectorAll('tr')).toHaveLength(1)
    expect(body.querySelectorAll('td')).toHaveLength(2)
  })

  it('ePub: capítulos en orden, imágenes del libro y nada que se ejecute', () => {
    const files = {
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'),
      'OPS/book.opf': strToU8('<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Libro</dc:title></metadata><manifest><item id="a" href="t/a.xhtml"/><item id="b" href="t/b.xhtml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>'),
      'OPS/t/a.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Segundo</p><img src="../i/x.png"/></body></html>'),
      'OPS/t/b.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body onload="x()"><script>x()</script><p>Primero <a href="javascript:x()">mal</a> <a href="https://a.b">bien</a></p></body></html>'),
      'OPS/i/x.png': new Uint8Array([1, 2, 3])
    }
    const { body, media } = readEpub(zipSync(files))
    expect(body.querySelector('h1')?.textContent).toBe('Libro')
    expect(Array.from(body.querySelectorAll('section p')).map((p) => p.textContent)).toEqual(['Primero mal bien', 'Segundo'])
    expect(body.querySelector('script')).toBeNull()
    expect(body.querySelectorAll('a[href]')).toHaveLength(1)
    expect(body.querySelector('[onload]')).toBeNull()
    expect(body.querySelector('img')?.dataset.media).toBe('OPS/i/x.png')
    expect(media.has('OPS/i/x.png')).toBe(true)
  })

  it('Pages y Keynote: la vista previa que traen dentro', () => {
    expect(readIwork(zipSync({ 'preview.jpg': new Uint8Array([1]), 'Index/Document.iwa': new Uint8Array([2]) })).preview).toBe('preview.jpg')
    expect(readIwork(zipSync({ 'QuickLook/Preview.pdf': new Uint8Array([1]) })).pdf).toBe('QuickLook/Preview.pdf')
    expect(() => readIwork(zipSync({ 'Index/Document.iwa': new Uint8Array([2]) }))).toThrow()
  })
})
