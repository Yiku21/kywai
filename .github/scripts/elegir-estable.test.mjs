// node --test .github/scripts/elegir-estable.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { comparar, elegir, FRESCO, numero, SEMANA } from './elegir-estable.mjs'

const AHORA = 1_800_000_000
const beta = (v) => ({ tag_name: `v${v}`, prerelease: true, draft: false })
const releases = [beta('0.1.1170'), beta('0.1.1165'), beta('0.1.1160'), beta('0.1.1152'), { tag_name: 'v0.1.1131', prerelease: false, draft: false }]
const verde = { ok: true, cuando: AHORA - 3600, version: '0.1.1165' }
const base = { releases, estable: 'v0.1.1131', pruebas: verde, anterior: null, ahora: AHORA }

test('las versiones se comparan por números', () => {
  assert.deepEqual(numero('v0.1.1160'), [0, 1, 1160])
  assert.deepEqual(numero('0.1.987'), [0, 1, 987])
  for (const malo of ['', 'v0.1', 'latest', '0.1.2-beta', null, undefined, 'v0.1.2; rm']) assert.equal(numero(malo), null)
  assert.ok(comparar(numero('0.1.1160'), numero('0.1.987')) > 0)
  assert.equal(comparar(numero('0.2.0'), numero('v0.2.0')), 0)
})

test('con las pruebas en verde pasa a Estable la más nueva que ya estaba probada', () => {
  const r = elegir(base)
  assert.equal(r.promover, 'v0.1.1165')
  assert.match(r.motivo, /probado hasta la 0\.1\.1165/)
  // Lo probado puede no coincidir con una versión publicada (un commit que solo tocó documentos): vale la anterior.
  assert.equal(elegir({ ...base, pruebas: { ...verde, version: '0.1.1163' } }).promover, 'v0.1.1160')
})

test('sin verde de anoche no se promueve nada', () => {
  assert.equal(elegir({ ...base, pruebas: null }).promover, '')
  assert.equal(elegir({ ...base, pruebas: { ...verde, ok: false } }).promover, '')
  assert.equal(elegir({ ...base, pruebas: { ...verde, ok: 'true' } }).promover, '')
  assert.equal(elegir({ ...base, pruebas: { ...verde, cuando: AHORA - FRESCO - 60 } }).promover, '')
  assert.equal(elegir({ ...base, pruebas: { ...verde, version: '' } }).promover, '')
  assert.equal(elegir({ ...base, pruebas: { ok: true } }).promover, '')
})

test('si lo probado no pasa de la Estable de ahora, no hay nada que promover', () => {
  const r = elegir({ ...base, pruebas: { ...verde, version: '0.1.1131' } })
  assert.equal(r.promover, '')
  assert.match(r.motivo, /No hay ninguna versión nueva que ya esté probada/)
})

test('el horario respeta «una por semana»; a mano no', () => {
  const anterior = { version: '0.1.1131', cuando: AHORA - 2 * 24 * 3600 }
  assert.equal(elegir({ ...base, anterior, programado: true }).promover, '')
  assert.equal(elegir({ ...base, anterior, programado: false }).promover, 'v0.1.1165')
  assert.equal(elegir({ ...base, anterior: { ...anterior, cuando: AHORA - SEMANA - 60 }, programado: true }).promover, 'v0.1.1165')
})

test('una versión pedida a mano también tiene que estar probada, salvo con forzar', () => {
  assert.equal(elegir({ ...base, pedida: '0.1.1160' }).promover, 'v0.1.1160')
  assert.equal(elegir({ ...base, pedida: 'v0.1.1170' }).promover, '')
  assert.equal(elegir({ ...base, pedida: '0.1.1170', forzar: true }).promover, 'v0.1.1170')
  assert.equal(elegir({ ...base, pedida: '0.1.9999', forzar: true }).promover, '')
  assert.equal(elegir({ ...base, pedida: '0.1.1131' }).promover, '')
})

test('volver la Estable a una versión anterior solo con forzar', () => {
  const con = { ...base, estable: 'v0.1.1165', pruebas: { ...verde, version: '0.1.1170' } }
  assert.equal(elegir({ ...con, pedida: '0.1.1152' }).promover, '')
  assert.equal(elegir({ ...con, pedida: '0.1.1152', forzar: true }).promover, 'v0.1.1152')
})

test('forzar sin pedir versión coge la más nueva publicada, aunque no haya pruebas', () => {
  assert.equal(elegir({ ...base, pruebas: null, forzar: true }).promover, 'v0.1.1170')
})

test('los borradores y las etiquetas raras no cuentan, y sin Estable previa también elige', () => {
  const raras = [{ tag_name: 'v0.1.1180', prerelease: true, draft: true }, { tag_name: 'pruebas', prerelease: true, draft: false }, null, ...releases]
  assert.equal(elegir({ ...base, releases: raras, pruebas: { ...verde, version: '0.1.1190' } }).promover, 'v0.1.1170')
  assert.equal(elegir({ ...base, estable: '' }).promover, 'v0.1.1165')
  assert.equal(elegir({ ...base, releases: 'no es una lista' }).promover, '')
})
