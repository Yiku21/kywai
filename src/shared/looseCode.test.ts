import { describe, expect, it } from 'vitest'
import { fenceLooseJson } from './looseCode'

const POLICY =
  '{ "Version": "2012-10-17", "Statement": [ { "Sid": "Fuera", "Effect": "Deny", "Action": "*", "Resource": "*", "Condition": { "NotIpAddress": { "aws:SourceIp": ["10.0.0.1/32"] } } } ] }'

/** El JSON de dentro de la primera tarjeta ```json, sin la sangría de la lista. */
function firstBlock(md: string): string {
  const m = md.match(/```json\n([\s\S]*?)\n\s*```/)
  if (!m) throw new Error(`sin tarjeta:\n${md}`)
  return m[1]
}

describe('fenceLooseJson', () => {
  it('saca a una tarjeta el JSON escrito en un punto de la lista, con sus * intactos', () => {
    const md = `1. Abre IAM.\n2. Crea la política.\n3. Cambia el editor a JSON y pega esto: ${POLICY}\n4. Pulsa Next.`
    const out = fenceLooseJson(md)
    expect(out).toContain('3. Cambia el editor a JSON y pega esto:\n\n   ```json\n   {')
    expect(JSON.parse(firstBlock(out))).toEqual(JSON.parse(POLICY))
    expect(firstBlock(out)).toContain('"Action": "*"')
    // Sigue dentro del punto 3 (sangría de 3) y el 4 queda separado.
    expect(out).toMatch(/\n {3}```\n\n4\. Pulsa Next\./)
  })

  it('lo que sigue en la misma línea pasa a su párrafo dentro del mismo punto', () => {
    const out = fenceLooseJson(`- Pega ${POLICY} y guarda.`)
    expect(out).toMatch(/ {2}```\n\n {2}y guarda\.$/)
  })

  it('en un párrafo normal, sin sangría', () => {
    const out = fenceLooseJson(`Usa esto: {"a": "*b*", "c": 1}`)
    expect(out).toBe('Usa esto:\n\n```json\n{\n  "a": "*b*",\n  "c": 1\n}\n```')
  })

  it('JSON en varias líneas fuera de un bloque', () => {
    const md = 'Pega:\n{\n  "Action": "s3:*",\n  "Resource": "*"\n}\nListo.'
    const out = fenceLooseJson(md)
    expect(firstBlock(out)).toBe('{\n  "Action": "s3:*",\n  "Resource": "*"\n}')
    expect(out.endsWith('```\n\nListo.')).toBe(true)
  })

  it('no toca bloques de código ni código en línea', () => {
    const fenced = '```json\n{"a": "*"}\n```'
    expect(fenceLooseJson(fenced)).toBe(fenced)
    const inline = 'Pega `{"Action": "*", "Resource": "*"}` en el editor.'
    expect(fenceLooseJson(inline)).toBe(inline)
  })

  it('no toca lo que no es JSON: enlaces, tareas, llaves de plantilla, números', () => {
    for (const md of ['Mira [la guía](https://x.y) y {nombre}.', '- [ ] tarea\n- [x] hecha', 'Notas [1] y [2, 3].', 'Vacío: {} y [].', '| a | {"x": "yyyyyyyyyyyy"} |'])
      expect(fenceLooseJson(md)).toBe(md)
  })

  it('una lista de textos también va en su tarjeta', () => {
    const out = fenceLooseJson('Añádela: ["99.7.70.209/32", "otra.ip/32"].')
    expect(JSON.parse(firstBlock(out))).toEqual(['99.7.70.209/32', 'otra.ip/32'])
  })

  it('dentro de una cita sigue en la cita', () => {
    const out = fenceLooseJson('> Pega {"Action": "*", "Resource": "*"}')
    expect(out.split('\n').every((l) => l.startsWith('>'))).toBe(true)
  })

  it('un JSON a medio llegar se deja como está', () => {
    const md = 'Pega esto: { "Version": "2012-10-17", "Statement": [ {'
    expect(fenceLooseJson(md)).toBe(md)
  })
})
