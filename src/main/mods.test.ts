import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CoworkEvent, Task } from '@shared/types'
import { allowModHooks, expandModCommand, fireHooks, hookFor, initMods, installModFolder, listMods, modPanelHtml, parseManifest, withAndroidBridge, ANDROID_BRIDGE, removeMod, runHookCommand, setModEnabled } from './mods'

const EXAMPLE = join(__dirname, '..', '..', 'docs', 'mods', 'notas-rapidas')
let root = ''

function mod(dir: string, manifest: object, files: Record<string, string> = {}): string {
  const d = join(root, 'src', dir)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'kywai-mod.json'), JSON.stringify(manifest))
  for (const [k, v] of Object.entries(files)) {
    mkdirSync(join(d, k, '..'), { recursive: true })
    writeFileSync(join(d, k), v)
  }
  return d
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kywai-mods-'))
  mkdirSync(join(root, 'proyecto'))
  initMods(join(root, 'data'), { project: () => ({ name: 'Mi proyecto', dir: join(root, 'proyecto') }) })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('mods', () => {
  it('el manifiesto se valida con mensajes claros', () => {
    const has = (): boolean => true
    expect(() => parseManifest('{', has)).toThrow(/JSON/)
    expect(() => parseManifest(JSON.stringify({ name: 'Malo Nombre', commands: [{ name: 'a', prompt: 'x' }] }), has)).toThrow(/name/)
    expect(() => parseManifest(JSON.stringify({ name: 'a' }), has)).toThrow(/ninguna/)
    expect(() => parseManifest(JSON.stringify({ name: 'a', hooks: [{ on: 'siempre', run: 'x' }] }), has)).toThrow(/on/)
    expect(() => parseManifest(JSON.stringify({ name: 'a', panels: [{ id: 'p', file: '../fuera.html' }] }), has)).toThrow(/html/)
    const m = parseManifest(JSON.stringify({ name: 'a', commands: [{ name: '/Hola', prompt: 'hola {args}' }], hooks: [{ on: 'task.done', run: 'echo x', timeout: 9999 }], permissions: ['chat', 'root'] }), has)
    expect(m.commands[0].name).toBe('hola')
    expect(m.hooks[0].timeout).toBe(600)
    expect(m.permissions).toEqual(['chat'])
  })

  it('instala el mod de ejemplo desde su carpeta', () => {
    const list = installModFolder(EXAMPLE)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'notas-rapidas', enabled: true, hooksAllowed: false, permissions: ['chat'] })
    expect(list[0].commands.map((c) => c.name)).toEqual(['resumen', 'revisa'])
    expect(() => installModFolder(join(root, 'proyecto'))).toThrow(/kywai-mod\.json/)
  })

  it('las órdenes cambian el texto, respetan las de kywai y el primero que la tenga', () => {
    installModFolder(EXAMPLE)
    installModFolder(mod('otro', { name: 'otro', commands: [{ name: 'resumen', prompt: 'otro' }, { name: 'directo', prompt: 'x' }, { name: 'sin-args', prompt: 'Hazlo' }] }))
    expect(expandModCommand('/revisa el login')?.text).toBe('Revisa con ojo crítico el login: errores, casos que fallan y cómo mejorarlo. Dame una lista ordenada por importancia.')
    expect(expandModCommand('/resumen')?.mod).toBe('notas-rapidas')
    expect(expandModCommand('/sin-args y esto')?.text).toBe('Hazlo\n\ny esto')
    expect(expandModCommand('/directo Qwen hola')).toBeNull()
    expect(expandModCommand('hola /resumen')).toBeNull()
    expect(listMods().find((m) => m.name === 'otro')?.shadowed).toEqual(['resumen', 'directo'])
    setModEnabled('notas-rapidas', false)
    expect(expandModCommand('/resumen')?.mod).toBe('otro')
  })

  it('los hooks solo se ejecutan con permiso, y el permiso caduca si cambian', async () => {
    writeFileSync(join(root, 'proyecto', 'hook.cjs'), "require('node:fs').writeFileSync('hecho.txt', process.env.KYWAI_TASK_TITLE + ' en ' + process.env.KYWAI_PROJECT)")
    const dir = mod('h', { name: 'h', hooks: [{ on: 'task.done', run: `"${process.execPath}" hook.cjs` }] })
    installModFolder(dir)
    const task = { title: 'Arreglar el login', status: 'done', result: 'ok', agentId: 'claude' } as Pick<Task, 'title' | 'status' | 'result' | 'agentId'>
    await fireHooks('task.done', { projectId: 'p', task })
    expect(() => readFileSync(join(root, 'proyecto', 'hecho.txt'))).toThrow()
    allowModHooks('h', true)
    await fireHooks('task.done', { projectId: 'p', task })
    expect(readFileSync(join(root, 'proyecto', 'hecho.txt'), 'utf8').trim()).toBe('Arreglar el login en Mi proyecto')
    expect(listMods()[0].lastHook).toMatchObject({ on: 'task.done', ok: true })
    // Una versión nueva con otra orden: hay que volver a dar permiso.
    installModFolder(mod('h', { name: 'h', hooks: [{ on: 'task.done', run: 'echo otra' }] }))
    expect(listMods()[0].hooksAllowed).toBe(false)
  })

  it('una orden que tarda demasiado se corta', async () => {
    writeFileSync(join(root, 'espera.cjs'), 'setTimeout(() => {}, 5000)')
    const r = await runHookCommand(`"${process.execPath}" espera.cjs`, root, {}, 1)
    expect(r.ok).toBe(false)
    expect(r.output).toMatch(/1 s/)
  })

  it('cada suceso del motor dispara su hook una sola vez', () => {
    const seen = new Map<string, string>()
    const up = (status: string): CoworkEvent => ({ kind: 'task.upsert', task: { id: 't1', projectId: 'p', status, title: 'x' } as Task, id: '1', ts: 0 }) as CoworkEvent
    expect(hookFor(up('pending'), seen)).toBeNull()
    expect(hookFor(up('running'), seen)?.on).toBe('task.started')
    expect(hookFor(up('running'), seen)).toBeNull()
    expect(hookFor(up('done'), seen)?.on).toBe('task.done')
    expect(hookFor({ kind: 'run.finished', runId: 'r', projectId: 'p', ok: false, id: '2', ts: 0 } as CoworkEvent, seen)).toMatchObject({ on: 'request.finished', ok: false })
  })

  it('el panel va con su política de seguridad delante y sus archivos dentro', () => {
    const dir = mod('pan', { name: 'pan', panels: [{ id: 'p', title: 'P', file: 'ui/p.html' }] }, {
      'ui/p.html': '<!doctype html><script>fetch("https://x")</script><head></head><img src="logo.png"><script src="app.js"></script>',
      'ui/logo.png': 'png',
      'ui/app.js': 'console.log(1)'
    })
    installModFolder(dir)
    const { html, chat } = modPanelHtml('pan', 'p')
    expect(html.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"')).toBe(true)
    expect(html).not.toContain('connect-src https:')
    // Ni siquiera un formulario puede mandar nada fuera ni cambiar la página por otra.
    expect(html).toContain("form-action 'none'")
    expect(html).toContain('src="data:image/png;base64,')
    expect(html).toContain('src="data:text/javascript;base64,')
    expect(chat).toBe(false)
  })

  it('en Órbita, el puente va justo después de la política de seguridad, antes que el código del panel', () => {
    const dir = mod('pan2', { name: 'pan2', panels: [{ id: 'p', title: 'P', file: 'p.html' }] }, { 'p.html': '<!doctype html><script>panel()</script>' })
    installModFolder(dir)
    const html = withAndroidBridge(modPanelHtml('pan2', 'p').html)
    expect(html).toMatch(/^<!doctype html><meta http-equiv="Content-Security-Policy"[^>]*><script>\(function/)
    expect(html.indexOf(ANDROID_BRIDGE)).toBeLessThan(html.indexOf('panel()'))
  })

  it('quitar un mod lo borra entero', () => {
    installModFolder(EXAMPLE)
    expect(removeMod('notas-rapidas')).toEqual([])
    expect(() => modPanelHtml('notas-rapidas', 'equipo')).toThrow()
  })
})
