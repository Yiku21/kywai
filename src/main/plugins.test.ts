import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import { McpRegistry, initExtensions, listMcp } from './extensions'
import { initSkills, listSkills } from './skills'
import { __setFetchForTests, addPluginLink, githubRepoOf, initPlugins, installCatalogPlugin, listPlugins, loadMarketplace, mcpInputOf, planPlugin, pluginCatalog, readTar, removePlugin, resolveSource } from './plugins'

/** Un .tar como los de GitHub: todo dentro de «repo-sha/», con una cabecera pax para un nombre largo. */
function tar(files: Record<string, string>, top = 'kit-abc123'): Buffer {
  const blocks: Buffer[] = []
  const header = (name: string, size: number, type: string): Buffer => {
    const h = Buffer.alloc(512)
    h.write(name.slice(0, 99), 0, 'utf8')
    h.write('0000644\0', 100)
    h.write('0000000\0', 108)
    h.write('0000000\0', 116)
    h.write(`${size.toString(8).padStart(11, '0')}\0`, 124)
    h.write('00000000000\0', 136)
    h.write(type, 156)
    h.write('ustar\0', 257)
    h.write('00', 263)
    h.fill(' ', 148, 156)
    let sum = 0
    for (const b of h) sum += b
    h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    return h
  }
  const pad = (b: Buffer): Buffer => Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)])
  const glob = Buffer.from('52 comment=abc123abc123abc123abc123abc123abc123ab\n')
  blocks.push(header('pax_global_header', glob.length, 'g'), pad(glob))
  for (const [name, text] of Object.entries(files)) {
    const full = `${top}/${name}`
    const data = Buffer.from(text)
    if (full.length > 99) {
      const rec = `path=${full}\n`
      let len = rec.length + 3
      len = rec.length + String(len).length + 1
      const pax = Buffer.from(`${len} ${rec}`)
      blocks.push(header('././@PaxHeader', pax.length, 'x'), pad(pax))
    }
    blocks.push(header(full, data.length, '0'), pad(data))
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

const SKILL = (name: string): string => `---\nname: ${name}\ndescription: hace ${name}\n---\n\n# ${name}\n`

const PLUGIN: Record<string, string> = {
  'plugins/notas/.claude-plugin/plugin.json': JSON.stringify({ name: 'notas', displayName: 'Notas', description: 'Toma notas', version: '1.0.0', hooks: './hooks/hooks.json' }),
  'plugins/notas/skills/resumir/SKILL.md': SKILL('resumir'),
  'plugins/notas/skills/resumir/scripts/r.py': 'print(1)',
  'plugins/notas/commands/nota.md': '---\ndescription: Guarda una nota\n---\nGuarda la nota: $ARGUMENTS\n',
  'plugins/notas/agents/revisor.md': '---\nname: revisor\ndescription: Revisa notas\n---\nEres un revisor.\n',
  'plugins/notas/hooks/hooks.json': '{}',
  'plugins/notas/.mcp.json': JSON.stringify({
    mcpServers: {
      local: { command: '${CLAUDE_PLUGIN_ROOT}/bin/server', args: ['--dir', '${CLAUDE_PLUGIN_ROOT}/data'], env: { NOTAS_TOKEN: '${NOTAS_TOKEN}' } },
      remoto: { type: 'http', url: 'https://mcp.ejemplo.com/mcp', headers: { Authorization: 'Bearer ${TOKEN}' } },
      login: { type: 'http', url: 'https://mcp.login.com/mcp', oauth: { clientId: 'x' } },
      viejo: { type: 'sse', url: 'https://x/sse' }
    }
  }),
  'plugins/notas/skills/resumir/references/una-ruta-muy-larga-para-que-el-nombre-pase-de-cien-caracteres-y-use-pax.md': 'largo',
  'README.md': '# repo'
}

const MARKET = {
  name: 'kit',
  plugins: [
    { name: 'notas', displayName: 'Notas', description: 'Toma notas', category: 'productividad', source: './plugins/notas' },
    { name: 'fuera', description: 'En otro repositorio', source: { source: 'git-subdir', url: 'https://github.com/otro/repo.git', path: 'p/fuera', ref: 'main', sha: 'abcdef1' } },
    { name: 'gitlab', description: 'No está en GitHub', source: { source: 'url', url: 'https://gitlab.com/a/b.git' } },
    { name: '../malo', source: './x' }
  ]
}

let dirs: string[] = []
let web: Record<string, Buffer | string | object> = {}
let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kywai-plug-'))
  dirs.push(root)
  initSkills(join(root, 'workspace'))
  initExtensions(new McpRegistry(join(root, 'mcp-servers.json'), { available: () => false, encrypt: (s) => s, decrypt: (s) => s }), { geminiDir: join(root, 'gemini') })
  initPlugins(join(root, 'data'))
  web = {
    'https://raw.githubusercontent.com/acme/kit/HEAD/.claude-plugin/marketplace.json': MARKET,
    'https://codeload.github.com/acme/kit/tar.gz/HEAD': gzipSync(tar(PLUGIN))
  }
  __setFetchForTests((async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') return new Response('', { status: url.includes('login') ? 401 : 200 })
    const body = web[url]
    if (body === undefined) return new Response('no', { status: 404 })
    return new Response(Buffer.isBuffer(body) ? body : typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
  }) as typeof fetch)
})

afterEach(() => {
  __setFetchForTests(null)
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

describe('plugins', () => {
  it('lee un .tar de GitHub, también los nombres largos', () => {
    const files = readTar(tar({ 'a.txt': 'hola', [`${'x'.repeat(120)}.md`]: 'largo' }))
    expect(files.get('kit-abc123/a.txt')?.toString()).toBe('hola')
    expect(files.get(`kit-abc123/${'x'.repeat(120)}.md`)?.toString()).toBe('largo')
  })

  it('entiende de dónde sale cada plugin de un catálogo', () => {
    expect(resolveSource({ source: './plugins/a' }, 'o/m')).toEqual({ repo: 'o/m', ref: 'HEAD', path: 'plugins/a' })
    expect(resolveSource({ source: { source: 'git-subdir', url: 'https://github.com/x/y.git', path: 'p', ref: 'v1' } }, 'o/m')).toEqual({ repo: 'x/y', ref: 'v1', path: 'p' })
    expect(resolveSource({ source: { source: 'url', url: 'https://github.com/x/y.git', sha: 'abcdef1234' } }, 'o/m')).toEqual({ repo: 'x/y', ref: 'abcdef1234', path: '' })
    expect(resolveSource({ source: { source: 'github', repo: 'x/y' } }, 'o/m')).toEqual({ repo: 'x/y', ref: 'HEAD', path: '' })
    expect(resolveSource({ source: { source: 'url', url: 'https://gitlab.com/a/b.git' } }, 'o/m')).toBeNull()
    expect(resolveSource({ source: './../fuera' }, 'o/m')).toBeNull()
    expect(githubRepoOf('git@github.com:a/b.git')).toBe('a/b')
  })

  it('el catálogo descarta nombres raros y marca los que no se pueden descargar', async () => {
    const items = await loadMarketplace('acme/kit')
    expect(items.map((x) => x.name)).toEqual(['notas', 'fuera', 'gitlab'])
    expect(items.find((x) => x.name === 'gitlab')?.source).toBeNull()
    expect(items[0].verified).toBe(false)
  })

  it('ve lo que trae un plugin y lo que kywai no usa', () => {
    const files = new Map(Object.entries(PLUGIN).filter(([k]) => k.startsWith('plugins/notas/')).map(([k, v]) => [k.slice('plugins/notas/'.length), Buffer.from(v)]))
    const plan = planPlugin(files, 'x')
    expect(plan.name).toBe('notas')
    expect(plan.skillDirs).toEqual(['skills/resumir'])
    expect(plan.commands).toEqual(['commands/nota.md'])
    expect(plan.agents).toEqual(['agents/revisor.md'])
    expect(Object.keys(plan.mcp)).toEqual(['local', 'remoto', 'login', 'viejo'])
    expect(plan.skipped.join(' ')).toMatch(/hooks/)
  })

  it('un plugin que es una carpeta de skills: todas, o las que diga su ficha', () => {
    const files = new Map(['a/SKILL.md', 'b/SKILL.md', 'b/ref.md', 'tests/x/SKILL.md'].map((p): [string, Buffer] => [p, Buffer.from(SKILL('s'))]))
    expect(planPlugin(files, 'kit').skillDirs).toEqual(['a', 'b'])
    expect(planPlugin(files, 'kit', { skills: ['./a'] }).skillDirs).toEqual(['a'])
  })

  it('convierte sus servidores: ruta del plugin, claves vacías para rellenar y sin los que no puede usar', () => {
    const taken = new Set(['local'])
    const local = mcpInputOf('local', { command: '${CLAUDE_PLUGIN_ROOT}/bin/s', args: ['${CLAUDE_PLUGIN_ROOT}/d'], env: { K: '${K}', FIJO: 'si' } }, 'notas', '/datos/plugins/notas', taken)
    expect(local).toMatchObject({ id: 'notas-local', transport: 'stdio', command: '/datos/plugins/notas/bin/s', args: ['/datos/plugins/notas/d'], env: { K: '', FIJO: 'si' }, plugin: 'notas' })
    expect(typeof mcpInputOf('o', { type: 'http', url: 'https://x/mcp', oauth: {} }, 'notas', '/d', new Set())).toBe('string')
    expect(typeof mcpInputOf('o', { type: 'sse', url: 'https://x/sse' }, 'notas', '/d', new Set())).toBe('string')
  })

  it('instala un plugin del catálogo: habilidades, órdenes, subagentes y servidores apagados', async () => {
    const plugins = await installCatalogPlugin('acme/kit', 'notas').catch(() => null)
    // acme/kit no es un catálogo de los de siempre: hay que añadirlo antes con su enlace.
    expect(plugins).toBeNull()
    expect((await addPluginLink('https://github.com/acme/kit')).kind).toBe('marketplace')
    const after = await installCatalogPlugin('acme/kit', 'notas')
    expect(after).toHaveLength(1)
    const p = after[0]
    expect(p.skills).toEqual(['resumir', 'notas-nota', 'notas-revisor'])
    const ws = join(root, 'workspace', 'habilidades')
    expect(readFileSync(join(ws, 'resumir', 'scripts', 'r.py'), 'utf8')).toBe('print(1)')
    expect(existsSync(join(ws, 'resumir', 'references', 'una-ruta-muy-larga-para-que-el-nombre-pase-de-cien-caracteres-y-use-pax.md'))).toBe(true)
    expect(readFileSync(join(ws, 'notas-nota', 'SKILL.md'), 'utf8')).toMatch(/\$ARGUMENTS/)
    expect(listSkills().map((s) => s.name)).toEqual(expect.arrayContaining(['resumir', 'notas-nota', 'notas-revisor']))
    // Servidores: el local y el remoto con token; el de iniciar sesión y el SSE no.
    expect(p.mcp).toEqual(['local', 'remoto'])
    expect(p.skipped.join(' | ')).toMatch(/login.*sesión/)
    expect(p.skipped.join(' | ')).toMatch(/viejo.*SSE/)
    const servers = listMcp()
    expect(servers.map((s) => [s.id, s.plugin, s.agents.length])).toEqual([
      ['local', 'notas', 0],
      ['remoto', 'notas', 0]
    ])
    expect(normalize(servers[0].command ?? '')).toBe(join(root, 'data', 'plugins', 'notas', 'bin', 'server'))
    expect(existsSync(join(root, 'data', 'plugins', 'notas', '.claude-plugin', 'plugin.json'))).toBe(true)
  })

  it('si una skill ya existe, la del plugin lleva su nombre delante', async () => {
    await addPluginLink('acme/kit')
    initSkills(join(root, 'workspace'))
    mkdirSync(join(root, 'workspace', 'habilidades', 'resumir'), { recursive: true })
    writeFileSync(join(root, 'workspace', 'habilidades', 'resumir', 'SKILL.md'), SKILL('resumir'))
    const [p] = await installCatalogPlugin('acme/kit', 'notas')
    expect(p.skills[0]).toBe('notas-resumir')
  })

  it('quitar un plugin borra lo que trajo y nada más', async () => {
    await addPluginLink('acme/kit')
    await installCatalogPlugin('acme/kit', 'notas')
    expect(removePlugin('notas')).toEqual([])
    expect(listSkills().map((s) => s.name)).not.toContain('resumir')
    expect(listMcp()).toEqual([])
    expect(existsSync(join(root, 'data', 'plugins', 'notas'))).toBe(false)
  })

  it('reinstalar conserva sus servidores con sus agentes', async () => {
    await addPluginLink('acme/kit')
    await installCatalogPlugin('acme/kit', 'notas')
    // Lo encendemos para Claude a mano (sin probarlo: no hay servidor de verdad).
    const reg = JSON.parse(readFileSync(join(root, 'mcp-servers.json'), 'utf8'))
    reg.servers[1].agents = ['claude']
    reg.servers[1].test = { ok: true, tools: ['x'], at: new Date().toISOString() }
    writeFileSync(join(root, 'mcp-servers.json'), JSON.stringify(reg))
    await installCatalogPlugin('acme/kit', 'notas')
    expect(listMcp().find((s) => s.id === 'remoto')?.agents).toEqual(['claude'])
    expect(listPlugins()).toHaveLength(1)
  })

  it('un enlace a una carpeta instala ese plugin', async () => {
    const r = await addPluginLink('https://github.com/acme/kit/tree/HEAD/plugins/notas')
    expect(r).toMatchObject({ kind: 'plugin', name: 'notas' })
  })

  it('repositorio enorme: baja solo la carpeta del plugin, archivo a archivo', async () => {
    // codeload dice que el .tar.gz pasa del límite: no se descarga entero.
    web['https://codeload.github.com/acme/kit/tar.gz/HEAD'] = 'GRANDE'
    const base = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://codeload.github.com/acme/kit/tar.gz/HEAD') return new Response('x', { status: 200, headers: { 'content-length': String(500 * 1024 * 1024) } })
      if (url === 'https://api.github.com/repos/acme/kit/contents/plugins?ref=HEAD') return new Response(JSON.stringify([{ name: 'notas', type: 'dir', sha: 'arbolnotas' }]))
      if (url === 'https://api.github.com/repos/acme/kit/git/trees/arbolnotas?recursive=1') {
        const tree = Object.keys(PLUGIN).filter((k) => k.startsWith('plugins/notas/')).map((k) => ({ path: k.slice('plugins/notas/'.length), type: 'blob', size: 10 }))
        return new Response(JSON.stringify({ tree }))
      }
      const raw = 'https://raw.githubusercontent.com/acme/kit/HEAD/'
      if (url.startsWith(raw)) {
        const key = decodeURIComponent(url.slice(raw.length))
        return PLUGIN[key] !== undefined ? new Response(PLUGIN[key]) : new Response('no', { status: 404 })
      }
      if (init?.method === 'POST') return new Response('', { status: url.includes('login') ? 401 : 200 })
      return new Response('no', { status: 404 })
    }) as typeof fetch
    __setFetchForTests(base)
    const r = await addPluginLink('https://github.com/acme/kit/tree/HEAD/plugins/notas')
    expect(r).toMatchObject({ kind: 'plugin', name: 'notas' })
    expect(readFileSync(join(root, 'workspace', 'habilidades', 'resumir', 'scripts', 'r.py'), 'utf8')).toBe('print(1)')
  })

  it('un plugin de vídeo deja sus habilidades en la carpeta del estudio de vídeo', async () => {
    const video: Record<string, string> = {
      'plugins/clips/.claude-plugin/plugin.json': JSON.stringify({ name: 'clips', description: 'Make videos with HyperFrames' }),
      'plugins/clips/skills/montar/SKILL.md': SKILL('montar')
    }
    web['https://codeload.github.com/acme/kit/tar.gz/HEAD'] = gzipSync(tar(video))
    const r = await addPluginLink('https://github.com/acme/kit/tree/HEAD/plugins/clips')
    expect(r.plugins[0].video).toBe(true)
    const ws = join(root, 'workspace', 'habilidades')
    expect(existsSync(join(ws, 'video', 'montar', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(ws, 'montar'))).toBe(false)
    // No llega a las tareas normales, y al quitarlo se borra de la carpeta de vídeo.
    expect(listSkills().map((x) => x.name)).not.toContain('montar')
    removePlugin('clips')
    expect(existsSync(join(ws, 'video', 'montar'))).toBe(false)
  })

  it('busca en todos los catálogos y dice cuál falla', async () => {
    await addPluginLink('acme/kit')
    const r = await pluginCatalog('notas')
    expect(r.items.map((x) => x.name)).toEqual(['notas'])
    expect(r.errors.length).toBe(2) // los de Anthropic no existen en este «internet»
  })

  it('rechaza enlaces que no son de GitHub', async () => {
    await expect(addPluginLink('https://ejemplo.com/a/b')).rejects.toThrow(/GitHub/)
  })
})
