/**
 * Pruebas que se ejecutaron de verdad en una tarea, sacadas de su registro (no de lo que cuente el agente).
 *
 * El verificador no se fía de un «las pruebas pasan»: mira los comandos que el agente ejecutó y su resultado.
 * Solo cuenta un comando que de verdad comprueba algo y termina solo (npm test, vitest run, tsc --noEmit, pytest,
 * cargo test…), ejecutado tal cual: sin tuberías ni «|| true» que escondan el código de salida, sin modo vigilancia,
 * y después del último cambio en los archivos. Idea tomada de la «evidencia propia» de GG Coder (reimplementada).
 */
import type { TraceEntry } from './types'

export interface CheckCommandVerdict {
  /** Es una prueba que demuestra algo. */
  check: boolean
  /** Por qué no cuenta (si parece una prueba pero no vale), para el registro. */
  reason?: string
}

/** Lo que dice el registro de la tarea sobre sus pruebas. */
export interface TestEvidence {
  /**
   * passed: tras el último cambio se ejecutaron pruebas y la última vez de cada una pasó.
   * failed: tras el último cambio alguna prueba falló (y no volvió a pasar).
   * stale: hubo pruebas, pero se cambiaron archivos después.
   * none: no se ejecutó ninguna prueba.
   */
  status: 'passed' | 'failed' | 'stale' | 'none'
  /** Pruebas que cuentan (las de después del último cambio), en orden y sin repetir. */
  checks: { command: string; ok: boolean }[]
}

const WATCH = /(?:^|\s)(?:--watch(?:all)?(?:=true)?|-w|--ui|--inspect(?:-brk)?|--serve)(?=\s|$)/i
const NO_PROOF = /(?:^|\s)(?:--help|-h|--version|-v|--list(?:tests|files(?:only)?)?|--collect-only|--showconfig|--no-?check)(?=\s|$)/i
const MUTATES = /(?:^|\s)(?:--fix|--write|-u|--update(?:snapshots?)?|--init)(?=\s|$)/i
/** Scripts de package.json que comprueban sin cambiar nada. */
const SAFE_SCRIPT = /^(?:test(?::[\w-]+)?|check|typecheck|type-check|lint(?::check)?|format:check|format-check|verify|ci)$/i
const UNSAFE_SCRIPT = /(?:watch|dev|serve|start|fix|update|build:watch)$/i

/** Prefijos que no cambian lo que se ejecuta: «cd carpeta», variables de entorno, «npx». */
function stripPrefixes(seg: string): string {
  let s = seg.trim()
  for (;;) {
    const before = s
    s = s.replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/, '')
    s = s.replace(/^(?:npx|pnpm\s+exec|pnpm\s+dlx|yarn\s+exec|bunx)\s+(?:--yes\s+|-y\s+)?/i, '')
    s = s.replace(/^(?:\.\/)?node_modules\/\.bin\//, '')
    if (s === before) return s
  }
}

function classifySegment(raw: string): CheckCommandVerdict {
  const seg = stripPrefixes(raw)
  if (!seg) return { check: false }
  if (WATCH.test(seg)) return { check: false, reason: 'modo vigilancia: no termina solo' }
  if (NO_PROOF.test(seg)) return { check: false, reason: 'no ejecuta las pruebas' }
  if (MUTATES.test(seg)) return { check: false, reason: 'cambia archivos (actualiza o arregla)' }
  const words = seg.split(/\s+/)
  const [a, b = '', c = ''] = words.map((w) => w.replace(/^["']|["']$/g, ''))
  const exe = a.replace(/^.*[\\/]/, '').replace(/\.(?:cmd|exe)$/i, '').toLowerCase()

  // npm test · npm run typecheck · pnpm lint · yarn test:unit · bun run test
  if (['npm', 'pnpm', 'yarn', 'bun'].includes(exe)) {
    const script = b === 'run' || b === 'run-script' ? c : b
    if (!script) return { check: false }
    if (['test', 't', 'tst'].includes(script) && b !== 'run') return { check: true }
    if (UNSAFE_SCRIPT.test(script)) return { check: false, reason: `«${script}» no es una comprobación que termine sola` }
    if (SAFE_SCRIPT.test(script)) return { check: true }
    return { check: false }
  }
  if (exe === 'tsc' || exe === 'vue-tsc') {
    if (/(?:^|\s)-v(?=\s|$)/.test(seg)) return { check: false, reason: 'no ejecuta las pruebas' }
    return /(?:^|\s)--noemit(?=\s|$)/i.test(seg) ? { check: true } : { check: false, reason: 'tsc sin --noEmit genera archivos' }
  }
  if (exe === 'vitest') {
    // En una consola sin terminal vitest ya termina solo, pero «run» lo deja claro; «vitest» a secas también vale.
    return { check: true }
  }
  if (['jest', 'mocha', 'ava', 'playwright', 'cypress', 'eslint', 'biome', 'pyright', 'mypy', 'pytest', 'shellcheck', 'phpunit', 'rspec'].includes(exe)) {
    if (exe === 'playwright' && b !== 'test') return { check: false }
    if (exe === 'cypress' && b !== 'run') return { check: false }
    if (exe === 'biome' && !['check', 'lint', 'ci'].includes(b)) return { check: false }
    return { check: true }
  }
  if (exe === 'prettier') return /(?:^|\s)(?:--check|-c)(?=\s|$)/.test(seg) ? { check: true } : { check: false }
  if (exe === 'ruff') return b === 'check' ? { check: true } : { check: false }
  if (exe === 'node') return b === '--test' ? { check: true } : { check: false }
  if (exe === 'deno') return b === 'test' || b === 'check' ? { check: true } : { check: false }
  if (exe === 'uv' || exe === 'poetry' || exe === 'pipenv') return b === 'run' ? classifySegment(words.slice(2).join(' ')) : { check: false }
  if (/^python(?:3(?:\.\d+)?)?$/.test(exe) || exe === 'py') {
    return /^-m\s+(?:pytest|unittest|mypy|pyright|ruff\s+check)(?=\s|$)/.test(words.slice(1).join(' ')) ? { check: true } : { check: false }
  }
  if (exe === 'cargo') return ['test', 'check', 'clippy', 'nextest'].includes(b) ? { check: true } : { check: false }
  if (exe === 'go') return b === 'test' || b === 'vet' ? { check: true } : { check: false }
  if (exe === 'gradle' || exe === 'gradlew') return /(?:^|\s)(?:test|check|lint|testDebugUnitTest|[\w:]*[Tt]est)(?=\s|$)/.test(words.slice(1).join(' ')) ? { check: true } : { check: false }
  if (exe === 'mvn' || exe === 'mvnw') return /(?:^|\s)(?:test|verify)(?=\s|$)/.test(words.slice(1).join(' ')) ? { check: true } : { check: false }
  if (exe === 'dotnet' || exe === 'swift') return b === 'test' ? { check: true } : { check: false }
  if (exe === 'make' || exe === 'just') return ['test', 'check', 'lint'].includes(b) ? { check: true } : { check: false }
  return { check: false }
}

/** Partes de un comando unidas con «&&» (todas deben ir bien); null si lleva algo que esconde el código de salida. */
function segments(cmd: string): string[] | null {
  // «2>&1» y redirecciones a archivo no cambian el código de salida: se quitan antes de buscar tuberías.
  const s = cmd.replace(/\d?>&\d/g, ' ').replace(/\s\d?>>?\s*\S+/g, ' ')
  if (/\|\||(?<![|])\|(?![|])|;|(?<![&])&(?![&])|`|\$\(/.test(s)) return null
  return s.split('&&').map((x) => x.trim()).filter(Boolean)
}

/** ¿Este comando de consola es una prueba que, si termina bien, demuestra algo? */
export function classifyCheckCommand(cmd: string): CheckCommandVerdict {
  const body = cmd.trim()
  if (!body) return { check: false }
  const parts = segments(body)
  const looks = (s: string): boolean => classifySegment(s).check
  if (!parts) {
    // Parece una prueba pero su resultado queda escondido (| tail, || true, ;…): no cuenta, y se dice por qué.
    const pieces = body.split(/\|\||\||;|&&/).map((x) => x.trim())
    return pieces.some(looks) ? { check: false, reason: 'va con tuberías u otros comandos que esconden su resultado' } : { check: false }
  }
  let any = false
  for (const p of parts) {
    if (/^cd(?:\s|$)/.test(p) || /^(?:set|export)\s+[A-Z_]/i.test(p)) continue
    const v = classifySegment(p)
    if (!v.check) return v.reason ? v : { check: false }
    any = true
  }
  return any ? { check: true } : { check: false }
}

/** Un comando que quedó en segundo plano no demuestra nada: su resultado llega después (o nunca). */
const BACKGROUND = /running in (?:the )?background|en segundo plano|background (?:shell|task) (?:id|started)/i

/** Lee el registro de la tarea (todas sus vueltas, en orden) y dice qué pruebas cuentan. */
export function testEvidence(entries: readonly TraceEntry[]): TestEvidence {
  const runs: { idx: number; command: string; ok: boolean }[] = []
  let lastEdit = -1
  entries.forEach((e, idx) => {
    if (e.kind !== 'tool') return
    if ((e.tool === 'edit' || e.tool === 'write') && e.ok !== false) lastEdit = idx
    if (e.tool !== 'command' || e.ok === undefined) return
    const command = (e.body ?? e.title.replace(/^Ejecutando:\s*/, '')).trim()
    if (!classifyCheckCommand(command).check) return
    if (BACKGROUND.test(e.output ?? '')) return
    runs.push({ idx, command, ok: e.ok })
  })
  if (!runs.length) return { status: 'none', checks: [] }
  const after = runs.filter((r) => r.idx > lastEdit)
  if (!after.length) return { status: 'stale', checks: [] }
  // La última vez de cada prueba es la que vale (falló, se arregló y volvió a pasar = pasa).
  const last = new Map<string, boolean>()
  for (const r of after) {
    last.delete(r.command)
    last.set(r.command, r.ok)
  }
  const checks = [...last].map(([command, ok]) => ({ command, ok }))
  return { status: checks.every((c) => c.ok) ? 'passed' : 'failed', checks }
}
