/// <reference types="node" />
// Todos los textos de la interfaz que pasan por t('…') deben estar traducidos en cada idioma, con los mismos {huecos}.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { en } from '@shared/i18n-en'
import { __setLangForTests, locale, t } from './i18n'

const SRC = join(__dirname, '..', '..', '..')
const ROOTS = ['renderer/src', 'main', 'shared'].map((d) => join(SRC, d))

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.startsWith('i18n') && !/[\\/]__checks__[\\/]/.test(path) ? [path] : []
  })
}

/** Textos literales pasados a t(…) o tr(…): t('…'), t("…") y t(`…`) sin ${}. */
function extractKeys(code: string): string[] {
  const keys: string[] = []
  const re = /(?<![\w$.])tr?\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g
  for (const m of code.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? ''
    keys.push(raw.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)))
  }
  return keys
}

/** Textos entre comillas simples del código: los que se traducen al usarlos, con t(variable) o tr(CONSTANTE). */
function literals(code: string): string[] {
  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)))
}

const holes = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

describe('i18n', () => {
  afterEach(() => __setLangForTests('es'))

  const used = new Map<string, string>()
  const quoted = new Set<string>()
  for (const file of ROOTS.flatMap(sourceFiles)) {
    const code = readFileSync(file, 'utf8')
    for (const key of extractKeys(code)) used.set(key, relative(SRC, file))
    for (const text of literals(code)) quoted.add(text)
  }

  it('encuentra los textos de la interfaz', () => {
    expect(used.size).toBeGreaterThan(50)
  })

  it('todos los textos tienen traducción al inglés', () => {
    const missing = [...used].filter(([k]) => !(k in en)).map(([k, f]) => `${f}: ${k}`)
    expect(missing).toEqual([])
  })

  it('las traducciones conservan los mismos {huecos}', () => {
    const wrong = Object.entries(en).filter(([es, tr]) => holes(es) !== holes(tr)).map(([es]) => es)
    expect(wrong).toEqual([])
  })

  it('no quedan traducciones sin usar', () => {
    // Los que se traducen al usarlos (t(rol), tr(MENSAJE)…) cuentan si están escritos tal cual en el código.
    const unused = Object.keys(en).filter((k) => !used.has(k) && !quoted.has(k))
    expect(unused).toEqual([])
  })

  it('traduce y rellena huecos', () => {
    expect(t('Ajustes')).toBe('Ajustes')
    __setLangForTests('en')
    expect(t('Ajustes')).toBe('Settings')
    expect(locale()).toBe('en-US')
    expect(t('Texto que no existe {n}', { n: 3 })).toBe('Texto que no existe 3')
  })
})
