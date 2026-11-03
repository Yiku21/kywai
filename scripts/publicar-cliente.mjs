// Publica el instalador del cliente de escritorio (Windows) en tu servidor de AI Cowork: los clientes lo encuentran
// solos (al abrir y cada 6 h) o desde ⋮ → «Actualizar este equipo…».
//
//   npm run publicar-cliente -- --servidor 100.64.0.1 --codigo <código de acceso>
//
// El código de acceso es el del servidor (⋮ → Acceso desde otros dispositivos…; el de la dirección, tras «?t=»).
// También vale AICW_SERVIDOR y AICW_CODIGO en el entorno. Opciones: --sin-compilar (usa el instalador de release/).
//
// Cada versión va firmada: los clientes solo instalan lo que firma tu clave privada, que se guarda en este equipo
// (por defecto ~/.ai-cowork/firma-cliente.pem; otra con --clave o AICW_CLAVE_FIRMA) y nunca en el repositorio. La
// primera vez se crea sola y su parte pública se escribe en src/main/clientReleaseKey.ts: súbela con un commit.
// Guarda una copia de la privada: sin ella, los clientes ya instalados no aceptan versiones nuevas.
import { spawnSync } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const fail = (msg) => {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

const server = flag('servidor') ?? process.env.AICW_SERVIDOR
const code = flag('codigo') ?? process.env.AICW_CODIGO
if (!server || !code) fail('Falta el servidor o el código. Uso: npm run publicar-cliente -- --servidor 100.64.0.1 --codigo <código de acceso>')
const origin = (/^https?:\/\//i.test(server) ? server : `http://${server}`).replace(/\/+$/, '')
const base = /:\d+$/.test(origin) ? origin : `${origin}:8787`

// La versión sale del número de commits (siempre sube): 0.1.<commits>.
const git = spawnSync('git', ['rev-list', '--count', 'HEAD'], { cwd: root, encoding: 'utf8' })
if (git.status !== 0) fail('No se pudo contar los commits (¿es una copia con git?).')
const version = `0.1.${git.stdout.trim()}`
const installer = `AI-Cowork-Setup-${version}.exe`
const out = join(root, 'release')

// Clave de firma: la pública va dentro del cliente compilado, así que se prepara antes de compilar.
const keyFile = flag('clave') ?? process.env.AICW_CLAVE_FIRMA ?? join(homedir(), '.ai-cowork', 'firma-cliente.pem')
const keySource = join(root, 'src', 'main', 'clientReleaseKey.ts')
const keyText = readFileSync(keySource, 'utf8')
const embedded = /CLIENT_RELEASE_PUBLIC_KEY = `([^`]*)`|CLIENT_RELEASE_PUBLIC_KEY = '([^']*)'/.exec(keyText)
const publicPem = (embedded?.[1] ?? embedded?.[2] ?? '').trim()
let privateKey
if (existsSync(keyFile)) {
  privateKey = createPrivateKey(readFileSync(keyFile))
  const own = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString().trim()
  if (!publicPem) fail(`Tienes una clave en ${keyFile}, pero src/main/clientReleaseKey.ts está vacío. Copia en él su parte pública o usa otra clave con --clave.`)
  if (own !== publicPem) fail(`La clave de ${keyFile} no es la de src/main/clientReleaseKey.ts: los clientes rechazarían esta versión. Usa la clave buena con --clave.`)
} else {
  if (publicPem) fail(`No está la clave privada de firma (${keyFile}). Sin ella, los clientes no aceptan versiones nuevas: cópiala de tu copia de seguridad o indícala con --clave.`)
  if (args.includes('--sin-compilar')) fail('La primera vez hay que compilar, para que el cliente lleve la clave pública: quita --sin-compilar.')
  const pair = generateKeyPairSync('ed25519')
  mkdirSync(dirname(keyFile), { recursive: true })
  writeFileSync(keyFile, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  try { chmodSync(keyFile, 0o600) } catch { /* Windows */ }
  const pem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString().trim()
  writeFileSync(keySource, keyText.replace(/CLIENT_RELEASE_PUBLIC_KEY = (`[^`]*`|'[^']*')/, `CLIENT_RELEASE_PUBLIC_KEY = \`${pem}\``))
  privateKey = pair.privateKey
  console.log(`→ Clave de firma nueva en ${keyFile} (guarda una copia). Sube src/main/clientReleaseKey.ts con un commit.`)
}

if (!args.includes('--sin-compilar')) {
  console.log(`→ Compilando el cliente ${version}…`)
  const run = (cmd, a) => spawnSync(cmd, a, { cwd: root, stdio: 'inherit', shell: true })
  if (run('npx', ['electron-vite', 'build']).status !== 0) fail('Falló la compilación.')
  if (run('npx', ['electron-builder', '--win', `-c.extraMetadata.version=${version}`]).status !== 0) fail('Falló el instalador.')
}

const exe = join(out, installer)
if (!existsSync(exe)) fail(`No existe ${exe}. Compila sin --sin-compilar.`)
const data = readFileSync(exe)
const sha512 = createHash('sha512').update(data).digest('base64')
// Lo mismo que comprueba el cliente (releaseMessage en src/main/clientRelease.ts).
const firma = sign(null, Buffer.from(`AI Cowork cliente\n${version}\n${installer}\n${sha512}`), privateKey).toString('base64')
// Descriptor que lee el actualizador del cliente (electron-updater, proveedor genérico).
const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${installer}`,
  `    sha512: ${sha512}`,
  `    size: ${data.length}`,
  `path: ${installer}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  `firma: ${firma}`,
  ''
].join('\n')
writeFileSync(join(out, 'latest.yml'), yml)

async function put(name, body) {
  const res = await fetch(`${base}/api/client-release/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/octet-stream' },
    body
  }).catch((e) => fail(`No se pudo conectar con ${base}: ${e.message}`))
  const text = await res.text()
  if (!res.ok) fail(`El servidor rechazó ${name} (${res.status}): ${text}`)
  return text
}

console.log(`→ Subiendo ${installer} (${(data.length / 1048576).toFixed(0)} MB) a ${base}…`)
await put(installer, data)
console.log('→ Publicando la versión…')
await put('latest.yml', Buffer.from(yml))
console.log(`\n✓ Publicado el cliente ${version}. Los clientes lo ofrecerán al abrirse o desde ⋮ → «Actualizar este equipo…».\n`)
