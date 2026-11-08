import { describe, expect, it } from 'vitest'
import type { TraceEntry } from './types'
import { classifyCheckCommand, testEvidence } from './testEvidence'

const isCheck = (cmd: string): boolean => classifyCheckCommand(cmd).check

describe('classifyCheckCommand', () => {
  it('reconoce pruebas reales que terminan solas', () => {
    for (const cmd of [
      'npm test',
      'npm run test',
      'npm run typecheck',
      'pnpm lint',
      'yarn test:unit',
      'npx vitest run',
      'vitest run src/a.test.ts',
      'npx tsc --noEmit -p tsconfig.json',
      'cd app && npm test',
      'CI=1 npm test 2>&1',
      'pytest -q',
      'python -m pytest tests',
      'python3 -m unittest',
      'uv run pytest',
      'cargo test',
      'go test ./...',
      './gradlew test',
      'node --test',
      'ruff check .',
      'npx eslint src'
    ])
      expect(isCheck(cmd), cmd).toBe(true)
  })

  it('no cuenta lo que no demuestra nada', () => {
    for (const cmd of ['ls', 'git commit -m x', 'npm install', 'npm run build', 'npm run dev', 'cat package.json', 'node script.js', 'python app.py', 'ruff format .'])
      expect(isCheck(cmd), cmd).toBe(false)
  })

  it('rechaza pruebas con el resultado escondido o que no terminan, y dice por qué', () => {
    const cases: [string, RegExp][] = [
      ['npm test | tail -5', /tuberías/],
      ['npm test || true', /tuberías/],
      ['npm test; echo hecho', /tuberías/],
      ['npm test &', /tuberías/],
      ['npx vitest --watch', /vigilancia/],
      ['npx tsc -p .', /noEmit/],
      ['npx jest -u', /cambia archivos/],
      ['npx eslint --fix src', /cambia archivos/],
      ['pytest --collect-only', /no ejecuta/],
      ['npm run test:watch', /no es una comprobación/]
    ]
    for (const [cmd, why] of cases) {
      const v = classifyCheckCommand(cmd)
      expect(v.check, cmd).toBe(false)
      expect(v.reason ?? '', cmd).toMatch(why)
    }
  })
})

let n = 0
const cmd = (command: string, ok: boolean, output = ''): TraceEntry => ({ id: `c${n++}`, ts: n, kind: 'tool', tool: 'command', title: `Ejecutando: ${command}`, body: command, ok, output })
const edit = (): TraceEntry => ({ id: `e${n++}`, ts: n, kind: 'tool', tool: 'edit', title: 'Editando a.ts', ok: true })

describe('testEvidence', () => {
  it('sin pruebas: none', () => {
    expect(testEvidence([edit(), cmd('ls', true)]).status).toBe('none')
  })

  it('pruebas que pasan después del último cambio: passed', () => {
    const ev = testEvidence([edit(), cmd('npm test', true)])
    expect(ev).toEqual({ status: 'passed', checks: [{ command: 'npm test', ok: true }] })
  })

  it('falló, se arregló y volvió a pasar: cuenta la última vez', () => {
    expect(testEvidence([edit(), cmd('npm test', false), edit(), cmd('npm test', true)]).status).toBe('passed')
    expect(testEvidence([edit(), cmd('npm test', true), cmd('npm test', false)]).status).toBe('failed')
  })

  it('una prueba que falla tras el cambio aunque otra pase: failed', () => {
    expect(testEvidence([edit(), cmd('npm test', true), cmd('npm run typecheck', false)]).status).toBe('failed')
  })

  it('pruebas antes de cambiar archivos no valen: stale', () => {
    expect(testEvidence([cmd('npm test', true), edit()]).status).toBe('stale')
  })

  it('ignora comandos sin resultado, falsos o en segundo plano', () => {
    const pending: TraceEntry = { ...cmd('npm test', true), ok: undefined }
    expect(testEvidence([edit(), pending, cmd('npm test | tail', true), cmd('npm test', true, 'Command running in background with ID: b1')]).status).toBe('none')
  })

  it('usa el título si el paso no trae el comando', () => {
    const e: TraceEntry = { id: 'x', ts: 1, kind: 'tool', tool: 'command', title: 'Ejecutando: npm test', ok: true }
    expect(testEvidence([edit(), e]).status).toBe('passed')
  })
})
