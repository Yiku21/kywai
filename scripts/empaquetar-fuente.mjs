// Crea release/AI-Cowork-fuente.zip con el código (sin node_modules, compilados ni datos de workspace/)
// para llevarlo a otro equipo, p. ej. un Mac, y ejecutar allí scripts/instalar-mac.sh.
// Uso: npm run fuente
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'release')
mkdirSync(out, { recursive: true })

// Archivos del repositorio y nuevos que no estén ignorados (.gitignore deja fuera workspace/, out/, release/…).
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const list = join(out, 'fuente.txt')
writeFileSync(list, files.join('\n'))
const zip = join(out, 'AI-Cowork-fuente.zip')
rmSync(zip, { force: true })
// bsdtar crea .zip con -a (el tar de Git Bash es GNU y no sabe): en Windows se usa el del sistema.
const tar = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
execFileSync(tar, ['-a', '-c', '-f', 'release/AI-Cowork-fuente.zip', '-T', 'release/fuente.txt'], { cwd: root, stdio: 'inherit' })
rmSync(list, { force: true })
console.log(`creado ${zip} (${files.length} archivos)`)
