/*
 * «Buscar actualizaciones» con repositorios de git de verdad: un «GitHub» (repositorio vacío), el código del
 * desarrollo y el del Mac. Sin red. Desde la raíz del repositorio:
 *
 *   npx esbuild src/main/__checks__/update.check.ts --bundle --platform=node --format=cjs \
 *     --alias:electron=./src/main/__checks__/electron-stub.ts --alias:@shared=./src/shared --outfile=%TEMP%/aicw-update.cjs \
 *     && node %TEMP%/aicw-update.cjs
 */
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkForUpdates, setAsideLocalCommits } from '../selfUpdate'

const tmp = mkdtempSync(join(tmpdir(), 'aicw-update-'))
const origin = join(tmp, 'github.git')
const dev = join(tmp, 'desarrollo')
const mac = join(tmp, 'mac')
const git = (dir: string, args: string): string =>
  execSync(`git -c user.name=Prueba -c user.email=prueba@localhost -c init.defaultBranch=master ${args}`, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim()
const commit = (dir: string, file: string, msg: string): string => {
  writeFileSync(join(dir, file), msg)
  git(dir, `add ${file}`)
  git(dir, `commit -q -m "${msg}"`)
  return git(dir, 'rev-parse HEAD')
}

let passed = 0
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ok  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

async function main(): Promise<void> {
  try {
    git(tmp, `init -q --bare "${origin}"`)
    git(tmp, `clone -q "${origin}" desarrollo`)
    const c1 = commit(dev, 'a.txt', 'Primera version')
    git(dev, 'push -q origin master')
    git(tmp, `clone -q "${origin}" mac`)
    process.env.AICW_CHECK_ROOT = mac // sourceDir() = la carpeta del código del Mac
    process.env.AICW_CHECK_BUILD_COMMIT = c1 // la app instalada se compiló con c1

    await check('al día: nada que hacer', async () => {
      const s = await checkForUpdates()
      assert.deepEqual([s.canUpdate, s.commits.length, s.pendingInstall], [true, 0, undefined])
    })

    await check('hay un cambio nuevo en GitHub: se ofrece', async () => {
      commit(dev, 'b.txt', 'Cambio del desarrollo')
      git(dev, 'push -q origin master')
      const s = await checkForUpdates()
      assert.equal(s.canUpdate, true)
      assert.deepEqual(s.commits.map((c) => c.subject), ['Cambio del desarrollo'])
    })

    await check('un agente sube desde el Mac: el código está al día pero la app no → «sin instalar»', async () => {
      git(mac, 'pull -q --ff-only origin master')
      commit(mac, 'c.txt', 'Lo hizo un agente')
      git(mac, 'push -q origin master')
      const s = await checkForUpdates()
      assert.equal(s.canUpdate, true)
      assert.equal(s.pendingInstall, true)
      assert.deepEqual(s.commits.map((c) => c.subject), ['Lo hizo un agente', 'Cambio del desarrollo'])
    })

    await check('commits hechos en el Mac sin subir (y GitHub avanza): no se puede sin apartarlos', async () => {
      commit(mac, 'd.txt', 'Commit local del agente')
      git(dev, 'pull -q --ff-only origin master')
      commit(dev, 'e.txt', 'Otro cambio del desarrollo')
      git(dev, 'push -q origin master')
      const s = await checkForUpdates()
      assert.equal(s.canUpdate, false)
      assert.deepEqual(s.localCommits?.map((c) => c.subject), ['Commit local del agente'])
      assert.deepEqual(s.commits.map((c) => c.subject), ['Otro cambio del desarrollo'])
      assert.match(s.reason ?? '', /commits hechos aquí/)
    })

    await check('apartarlos: quedan en una rama y el código vuelve a ser el de GitHub', async () => {
      const local = git(mac, 'rev-parse HEAD')
      assert.equal(await setAsideLocalCommits(mac, 'master', 1), null)
      const branches = git(mac, 'branch --list "apartado/*" --format="%(refname:short) %(objectname)"')
      assert.match(branches, new RegExp(`^apartado/\\S+ ${local}$`))
      assert.equal(git(mac, 'rev-parse HEAD'), git(mac, 'rev-parse origin/master'))
      const s = await checkForUpdates()
      assert.equal(s.canUpdate, true)
      assert.equal(s.pendingInstall, true, 'la app sigue compilada con la primera versión')
      assert.equal(s.commits[0].subject, 'Otro cambio del desarrollo')
    })

    console.log(`\n${passed} comprobaciones de actualización superadas`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
