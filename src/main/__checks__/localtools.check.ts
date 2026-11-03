/*
 * Comprobaciones sin red de las herramientas del agente local (LM Studio).
 * Desde la raíz del repositorio:
 *
 *   npx esbuild src/main/__checks__/localtools.check.ts --bundle --platform=node --format=cjs \
 *     --tsconfig=tsconfig.node.json --outfile=%TEMP%/aicw-localtools.cjs && node %TEMP%/aicw-localtools.cjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runTool, toolDefinitions, type ToolContext } from '../agents/localTools'

const dir = mkdtempSync(join(tmpdir(), 'aicw-tools-'))
const work = join(dir, 'proyecto')
mkdirSync(join(work, 'src'), { recursive: true })
writeFileSync(join(work, 'src', 'main.ts'), 'const color = "azul"\nexport default color\n')
writeFileSync(join(dir, 'secreto.txt'), 'no deberías verme')

const files: string[] = []
let progress = -1
const ctx = (canWrite: boolean): ToolContext => ({
  cwd: work,
  canWrite,
  signal: new AbortController().signal,
  onActivity: () => {},
  onProgress: (p) => (progress = p),
  onFile: (p) => files.push(p)
})

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e) {
    console.log(`FAIL  ${name}`)
    console.error(e)
    process.exitCode = 1
  }
}

void (async () => {
  await check('leer, listar y buscar dentro del proyecto', async () => {
    assert.match(await runTool('read_file', '{"path":"src/main.ts"}', ctx(true)), /const color = "azul"/)
    assert.match(await runTool('list_files', '{}', ctx(true)), /src\//)
    assert.match(await runTool('search_files', '{"query":"AZUL"}', ctx(true)), /src\/main\.ts:1:/)
  })

  await check('no se puede salir de la carpeta del proyecto', async () => {
    assert.match(await runTool('read_file', '{"path":"../secreto.txt"}', ctx(true)), /fuera de la carpeta/)
    assert.match(await runTool('write_file', JSON.stringify({ path: join(dir, 'x.txt'), content: 'x' }), ctx(true)), /fuera de la carpeta/)
  })

  await check('editar exige un fragmento exacto y único', async () => {
    assert.match(await runTool('edit_file', '{"path":"src/main.ts","old_text":"rojo","new_text":"verde"}', ctx(true)), /No se encontró/)
    assert.match(await runTool('edit_file', '{"path":"src/main.ts","old_text":"\\"azul\\"","new_text":"\\"verde\\""}', ctx(true)), /Editado/)
    assert.match(readFileSync(join(work, 'src', 'main.ts'), 'utf8'), /"verde"/)
    assert.ok(files.some((f) => f.endsWith('main.ts')))
  })

  await check('en modo planificación no hay herramientas de escritura', async () => {
    assert.ok(!toolDefinitions(false).some((t) => JSON.stringify(t).includes('write_file')))
    assert.match(await runTool('write_file', '{"path":"a.txt","content":"x"}', ctx(false)), /no puedes modificar/)
  })

  await check('internet: bloquea direcciones locales y privadas', async () => {
    for (const url of ['http://localhost:1234/v1/models', 'http://127.0.0.1', 'http://192.168.1.1', 'http://10.0.0.5', 'file:///C:/Windows/win.ini']) {
      assert.match(await runTool('fetch_url', JSON.stringify({ url }), ctx(true)), /Error: (No se permite|Solo se permiten)/, url)
    }
  })

  await check('update_plan informa progreso real', async () => {
    await runTool('update_plan', '{"steps":[{"step":"a","done":true},{"step":"b","done":false}]}', ctx(true))
    assert.equal(progress, 0.5)
  })

  await check('argumentos rotos o herramientas desconocidas no rompen el agente', async () => {
    assert.match(await runTool('read_file', '{no json', ctx(true)), /no son JSON/)
    assert.match(await runTool('borrar_todo', '{}', ctx(true)), /desconocida/)
  })

  console.log(`\n${passed} comprobaciones de herramientas locales superadas`)
})()
