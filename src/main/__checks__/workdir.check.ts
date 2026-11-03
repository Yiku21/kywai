/*
 * Comprobaciones sin red de la carpeta de trabajo de un proyecto (acceso concedido por el usuario).
 * Desde la raíz del repositorio:
 *
 *   npx esbuild src/main/__checks__/workdir.check.ts --bundle --platform=node --format=cjs \
 *     --tsconfig=tsconfig.node.json --outfile=%TEMP%/aicw-workdir.cjs && node %TEMP%/aicw-workdir.cjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import * as store from '../projects'

let passed = 0
function check(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}`)
    console.error(e)
    process.exitCode = 1
  }
}

const base = mkdtempSync(join(tmpdir(), 'aicw-wd-'))
store.initProjects(join(base, 'workspace'))
const p = store.createProject('Prueba carpeta')
const work = join(base, 'mi-juego')
mkdirSync(join(work, 'src'), { recursive: true })
writeFileSync(join(work, 'src', 'main.gd'), 'extends Node\n')
writeFileSync(join(p.dir, 'attachments', 'brief.txt'), 'hola')

check('sin carpeta de trabajo: los agentes usan la carpeta interna', () => {
  assert.equal(store.workRoot(p.id), p.dir)
})

check('rechaza la raíz de un disco, la carpeta de usuario y el sistema', () => {
  assert.throws(() => store.validateWorkDir('C:\\'), /raíz/)
  assert.throws(() => store.validateWorkDir(homedir()), /usuario/)
  assert.throws(() => store.validateWorkDir(process.env.SystemRoot ?? 'C:\\Windows'), /sistema/)
  assert.throws(() => store.validateWorkDir(join(base, 'no-existe')), /no existe/)
  assert.throws(() => store.validateWorkDir('relativa/ruta'), /no válida/)
})

check('con acceso: trabajan en la carpeta del usuario y se guarda', () => {
  const s = store.setWorkDir(p.id, work)
  assert.equal(s.workDir, work)
  assert.equal(store.workRoot(p.id), work)
  store.flushAll()
  const saved = JSON.parse(readFileSync(join(p.dir, 'project.json'), 'utf8'))
  assert.equal(saved.project.workDir, work)
})

check('los adjuntos se copian a .ai-cowork/adjuntos (ignorada por git)', () => {
  const map = store.stageAttachments(p.id, [{ id: 'a', name: 'brief.txt', relPath: 'attachments/brief.txt', mime: 'text/plain', size: 4 }])
  assert.equal(map.get('attachments/brief.txt'), '.ai-cowork/adjuntos/brief.txt')
  assert.equal(readFileSync(join(work, '.ai-cowork', 'adjuntos', 'brief.txt'), 'utf8'), 'hola')
  assert.ok(existsSync(join(work, '.ai-cowork', '.gitignore')))
})

check('los archivos se encuentran en ambas carpetas y nunca fuera', () => {
  assert.equal(store.resolveProjectFile(p.id, 'attachments/brief.txt'), join(p.dir, 'attachments', 'brief.txt'))
  assert.equal(store.resolveProjectFile(p.id, 'src/main.gd'), join(work, 'src', 'main.gd'))
  assert.equal(store.resolveProjectFile(p.id, '../fuera.txt'), null)
  assert.equal(store.resolveProjectFile(p.id, 'no/existe.txt'), null)
})

void (async () => {
  const before = await store.snapshotFiles(work)
  assert.ok(before.has('src/main.gd'))
  assert.ok(!before.has('.ai-cowork/adjuntos/brief.txt'))
  mkdirSync(join(work, '.ai-cowork', 'entregables'), { recursive: true })
  writeFileSync(join(work, '.ai-cowork', 'entregables', 'informe.md'), '# Informe')
  mkdirSync(join(work, 'build'), { recursive: true })
  writeFileSync(join(work, 'build', 'salida.bin'), 'x')
  const after = await store.snapshotFiles(work)
  assert.ok(after.has('.ai-cowork/entregables/informe.md'), 'entregables visibles')
  assert.ok(!after.has('build/salida.bin'), 'carpetas de compilación ignoradas')
  passed++
  console.log('  ok  snapshot: código y entregables sí; adjuntos y compilación no')

  check('quitar el acceso vuelve a la carpeta interna', () => {
    const s = store.setWorkDir(p.id, null)
    assert.equal(s.workDir, undefined)
    assert.equal(store.workRoot(p.id), p.dir)
  })

  check('renombrar: cambia el nombre (sin espacios sobrantes), no la carpeta; vacío no se acepta', () => {
    const r = store.renameProject(p.id, '  Juego   de plataformas ')
    assert.equal(r.name, 'Juego de plataformas')
    assert.equal(r.dir, p.dir)
    assert.equal(store.listProjects().find((x) => x.id === p.id)?.name, 'Juego de plataformas')
    assert.throws(() => store.renameProject(p.id, '   '), /nombre/)
    assert.equal(store.getProject(p.id).project.name, 'Juego de plataformas')
  })
  console.log(`\n${passed} comprobaciones de carpeta de trabajo superadas`)
})()
