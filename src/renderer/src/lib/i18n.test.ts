/// <reference types="node" />
// Todos los textos de la interfaz que pasan por t('…') deben estar traducidos en cada idioma, con los mismos {huecos}.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { en } from './i18n/en'
import { __setLangForTests, locale, t } from './i18n'

const ROOT = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.startsWith('i18n') && !/[\\/]i18n[\\/]/.test(path) ? [path] : []
  })
}

/** Textos literales pasados a t(…): t('…'), t("…") y t(`…`) sin ${}. */
function extractKeys(code: string): string[] {
  const keys: string[] = []
  const re = /(?<![\w$.])t\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g
  for (const m of code.matchAll(re)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? ''
    keys.push(raw.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)))
  }
  return keys
}

const holes = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

describe('i18n', () => {
  afterEach(() => __setLangForTests('es'))

  const used = new Map<string, string>()
  for (const file of sourceFiles(ROOT)) {
    for (const key of extractKeys(readFileSync(file, 'utf8'))) used.set(key, relative(ROOT, file))
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
    const unused = Object.keys(en).filter((k) => !used.has(k))
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
