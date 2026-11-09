import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { __setFetchForTests, catalogItemOf, installSkill, installSkillsFromUrl, parseGithubUrl, referencedFiles, removeSkillFiles, searchMcpCatalog, searchSkillCatalog, verifiedName } from './catalog'

/** Un «internet» de mentira: dirección → respuesta (texto o JSON). */
function fakeWeb(pages: Record<string, unknown>): void {
  __setFetchForTests((async (input: string | URL) => {
    const url = String(input)
    const hit = Object.keys(pages).find((k) => url === k || (k.endsWith('*') && url.startsWith(k.slice(0, -1))))
    if (!hit) return new Response('no', { status: 404 })
    const body = pages[hit]
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 })
  }) as typeof fetch)
}

const SKILL = (name: string, extra = ''): string => `---\nname: ${name}\ndescription: prueba\n---\n\n# ${name}\n${extra}`

let dirs: string[] = []
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'kywai-cat-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  __setFetchForTests(null)
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs = []
})

describe('catálogo de servidores MCP', () => {
  it('convierte un paquete npm en su orden, con las claves para rellenar', () => {
    const item = catalogItemOf({
      name: 'io.github.acme/notas-mcp',
      title: 'Notas',
      version: '1.2.0',
      packages: [{ registryType: 'npm', identifier: '@acme/notas-mcp', version: '1.2.0', transport: { type: 'stdio' }, environmentVariables: [{ name: 'NOTAS_TOKEN', description: 'Tu token', isRequired: true, isSecret: true }] }]
    })!
    expect(item.kind).toBe('stdio')
    expect(item.install).toMatchObject({ id: 'notas', transport: 'stdio', command: 'npx', args: ['-y', '@acme/notas-mcp@1.2.0'], env: { NOTAS_TOKEN: '' } })
    expect(item.keys).toEqual([{ name: 'NOTAS_TOKEN', description: 'Tu token', required: true, secret: true }])
    expect(item.verified).toBe(false)
    expect(item.needsEdit).toBe(false)
  })

  it('no repite el -y y avisa si falta un argumento obligatorio', () => {
    const item = catalogItemOf({
      name: 'x/y',
      packages: [{ registryType: 'npm', identifier: 'y-mcp', runtimeArguments: [{ type: 'positional', value: '-y' }], packageArguments: [{ type: 'named', name: '--dir', isRequired: true, valueHint: 'carpeta' }] }]
    })!
    expect(item.install?.args).toEqual(['-y', 'y-mcp', '--dir=<carpeta>'])
    expect(item.needsEdit).toBe(true)
  })

  it('Python con uvx, Docker con sus variables y los remotos por HTTP', () => {
    expect(catalogItemOf({ name: 'a/py', version: '2.0', packages: [{ registryType: 'pypi', identifier: 'mcp-py', version: '2.0' }] })!.install).toMatchObject({ command: 'uvx', args: ['mcp-py==2.0'] })
    expect(catalogItemOf({ name: 'a/dk', packages: [{ registryType: 'oci', identifier: 'ghcr.io/a/dk', version: '3', environmentVariables: [{ name: 'K' }] }] })!.install).toMatchObject({ command: 'docker', args: ['run', '-i', '--rm', '-e', 'K', 'ghcr.io/a/dk:3'] })
    const remote = catalogItemOf({ name: 'com.github/github', remotes: [{ type: 'streamable-http', url: 'https://api.example.com/mcp', headers: [{ name: 'Authorization', isRequired: true, isSecret: true }] }] })!
    expect(remote.install).toMatchObject({ transport: 'http', url: 'https://api.example.com/mcp', headers: { Authorization: '' } })
    expect(remote.verified).toBe(true)
  })

  it('los que solo van por SSE o no dicen cómo se instalan no se pueden instalar', () => {
    expect(catalogItemOf({ name: 'a/sse', remotes: [{ type: 'sse', url: 'https://x/sse' }] })!.install).toBeNull()
    expect(catalogItemOf({ name: 'a/nada' })!.unsupported).toBeTruthy()
    expect(catalogItemOf({})).toBeNull()
  })

  it('verificado solo para los publicadores conocidos, no para quien se parezca', () => {
    expect(verifiedName('com.microsoft/playwright')).toBe(true)
    expect(verifiedName('com.microsoft.azure/x')).toBe(true)
    expect(verifiedName('com.microsoftt/x')).toBe(false)
    expect(verifiedName('io.github.alguien/github')).toBe(false)
  })

  it('busca en el registro: sin repetidos, los verificados primero y con la página siguiente', async () => {
    fakeWeb({
      'https://registry.modelcontextprotocol.io/v0/servers*': {
        servers: [
          { server: { name: 'io.github.otro/notion', packages: [{ registryType: 'npm', identifier: 'n1' }] } },
          { server: { name: 'com.notion/mcp', remotes: [{ type: 'streamable-http', url: 'https://mcp.notion.com/mcp' }] } },
          { server: { name: 'io.github.otro/notion', packages: [{ registryType: 'npm', identifier: 'n1' }] } }
        ],
        metadata: { nextCursor: 'c2' }
      }
    })
    const r = await searchMcpCatalog('notion')
    expect(r.items.map((x) => x.name)).toEqual(['com.notion/mcp', 'io.github.otro/notion'])
    expect(r.next).toBe('c2')
    expect(r.items[0].title).toBe('Notion')
  })

  it('un error del registro se dice, no se queda colgado', async () => {
    fakeWeb({})
    await expect(searchMcpCatalog('x')).rejects.toThrow()
  })
})

describe('catálogo de habilidades', () => {
  it('busca en skills.sh y descarta lo que no tiene forma de repositorio', async () => {
    fakeWeb({
      'https://skills.sh/api/search?q=pdf': {
        skills: [
          { source: 'alguien/cosas', skillId: 'pdf-x', name: 'pdf-x', installs: 5 },
          { source: 'anthropics/skills', skillId: 'pdf', name: 'pdf', installs: 900 },
          { source: '../malo', skillId: 'pdf', name: 'pdf' }
        ]
      }
    })
    const r = await searchSkillCatalog('pdf')
    expect(r.map((x) => `${x.source}/${x.skillId}`)).toEqual(['anthropics/skills/pdf', 'alguien/cosas/pdf-x'])
    expect(r[0].verified).toBe(true)
  })

  it('entiende los enlaces de GitHub y rechaza los que salen del repositorio', () => {
    expect(parseGithubUrl('https://github.com/obra/superpowers')).toEqual({ repo: 'obra/superpowers', ref: 'HEAD', path: '' })
    expect(parseGithubUrl('https://github.com/a/b/tree/main/skills/pdf/')).toEqual({ repo: 'a/b', ref: 'main', path: 'skills/pdf' })
    expect(parseGithubUrl('https://github.com/a/b/blob/main/skills/pdf/SKILL.md')).toEqual({ repo: 'a/b', ref: 'main', path: 'skills/pdf' })
    expect(parseGithubUrl('a/b')).toEqual({ repo: 'a/b', ref: 'HEAD', path: '' })
    expect(parseGithubUrl('https://github.com/a/b/tree/main/../../x')).toBeNull()
    expect(parseGithubUrl('https://gitlab.com/a/b')).toBeNull()
  })

  it('saca los archivos que cita un SKILL.md, sin enlaces de fuera ni rutas que suban', () => {
    const files = referencedFiles('Mira [la guía](reference/guia.md), ejecuta `scripts/fill.py` y lee FORMS.md. No [esto](https://x.com/a.md) ni `../fuera.sh`.')
    expect(files).toEqual(expect.arrayContaining(['reference/guia.md', 'scripts/fill.py', 'FORMS.md']))
    expect(files.some((f) => f.includes('..') || f.startsWith('http'))).toBe(false)
  })

  it('instala una skill con sus archivos usando el árbol del repositorio', async () => {
    const dir = tmp()
    fakeWeb({
      'https://api.github.com/repos/acme/kit/git/trees/HEAD?recursive=1': { tree: [{ path: 'skills/pdf/SKILL.md', type: 'blob' }, { path: 'skills/pdf/scripts/a.py', type: 'blob' }, { path: 'skills/otra/SKILL.md', type: 'blob' }] },
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/pdf/SKILL.md': SKILL('pdf'),
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/pdf/scripts/a.py': 'print(1)'
    })
    expect(await installSkill(dir, 'acme/kit', 'pdf')).toEqual(['pdf'])
    expect(readFileSync(join(dir, 'pdf', 'scripts', 'a.py'), 'utf8')).toBe('print(1)')
    expect(existsSync(join(dir, 'otra'))).toBe(false)
  })

  it('si el repositorio ya no la tiene, lo dice y enseña las que hay', async () => {
    const dir = tmp()
    fakeWeb({ 'https://api.github.com/repos/acme/kit/git/trees/HEAD?recursive=1': { tree: [{ path: 'skills/pdf/SKILL.md', type: 'blob' }, { path: 'skills/otra/SKILL.md', type: 'blob' }] } })
    await expect(installSkill(dir, 'acme/kit', 'general-video')).rejects.toThrow(/ya no está en acme\/kit.*pdf, otra/)
  })

  it('sin la API de GitHub la busca en los sitios de siempre y trae lo que cita', async () => {
    const dir = tmp()
    fakeWeb({
      'https://raw.githubusercontent.com/acme/kit/HEAD/.claude/skills/diseno/SKILL.md': SKILL('diseno', 'Lee `references/colores.md`.'),
      'https://raw.githubusercontent.com/acme/kit/HEAD/.claude/skills/diseno/references/colores.md': '# colores'
    })
    expect(await installSkill(dir, 'acme/kit', 'diseno')).toEqual(['diseno'])
    expect(readFileSync(join(dir, 'diseno', 'references', 'colores.md'), 'utf8')).toBe('# colores')
  })

  it('un nombre en el SKILL.md no puede escribir fuera de la carpeta de habilidades', async () => {
    const dir = tmp()
    fakeWeb({
      'https://api.github.com/repos/acme/kit/git/trees/HEAD?recursive=1': { tree: [{ path: 'skills/x/SKILL.md', type: 'blob' }, { path: 'skills/x/../../../fuera.txt', type: 'blob' }] },
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/x/SKILL.md': SKILL('../../escapa'),
      'https://raw.githubusercontent.com/acme/kit/HEAD/*': 'malo'
    })
    const [name] = await installSkill(dir, 'acme/kit', 'x')
    expect(name).not.toContain('/')
    expect(existsSync(join(dir, '..', 'fuera.txt'))).toBe(false)
  })

  it('un enlace a un repositorio instala todas sus skills, sin las de pruebas ni las anidadas', async () => {
    const dir = tmp()
    fakeWeb({
      'https://api.github.com/repos/acme/kit/git/trees/HEAD?recursive=1': {
        tree: ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/b/sub/SKILL.md', 'tests/fixtures/c/SKILL.md'].map((path) => ({ path, type: 'blob' }))
      },
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/a/SKILL.md': SKILL('a'),
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/b/SKILL.md': SKILL('b'),
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/b/sub/SKILL.md': SKILL('sub')
    })
    expect(await installSkillsFromUrl(dir, 'https://github.com/acme/kit')).toEqual(['a', 'b'])
    expect(existsSync(join(dir, 'b', 'sub', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, 'c'))).toBe(false)
  })

  it('un enlace sin skills o que no es de GitHub da un error claro', async () => {
    const dir = tmp()
    fakeWeb({ 'https://api.github.com/repos/acme/vacio/git/trees/HEAD?recursive=1': { tree: [{ path: 'README.md', type: 'blob' }] } })
    await expect(installSkillsFromUrl(dir, 'https://github.com/acme/vacio')).rejects.toThrow(/SKILL\.md/)
    await expect(installSkillsFromUrl(dir, 'https://ejemplo.com/x')).rejects.toThrow(/GitHub/)
  })

  it('quitar solo borra dentro de la carpeta de habilidades', () => {
    const dir = tmp()
    expect(() => removeSkillFiles(dir, join(dir, '..', 'otra', 'SKILL.md'))).toThrow()
  })
})

describe('habilidades de vídeo', () => {
  it('reconoce lo que es de vídeo y lo que no', async () => {
    const { isVideoExtension } = await import('@shared/videoExtensions')
    expect(isVideoExtension('hyperframes', 'Make videos from HTML')).toBe(true)
    expect(isVideoExtension('montaje', 'Edita vídeos con ffmpeg')).toBe(true)
    expect(isVideoExtension('pdf', 'Rellena formularios PDF')).toBe(false)
    expect(isVideoExtension('docs', 'Writes documentation')).toBe(false)
  })

  it('al instalarla, la de vídeo pasa a habilidades/video y sale marcada', async () => {
    const { initSkills } = await import('./skills')
    const { installCatalogSkill, installedSkills, removeSkill } = await import('./catalog')
    const ws = tmp()
    initSkills(ws)
    fakeWeb({
      'https://api.github.com/repos/acme/kit/git/trees/HEAD?recursive=1': { tree: [{ path: 'skills/clips/SKILL.md', type: 'blob' }, { path: 'skills/pdf/SKILL.md', type: 'blob' }] },
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/clips/SKILL.md': '---\nname: clips\ndescription: Make short videos\n---\n# clips\n',
      'https://raw.githubusercontent.com/acme/kit/HEAD/skills/pdf/SKILL.md': SKILL('pdf')
    })
    await installCatalogSkill('acme/kit', 'clips')
    await installCatalogSkill('acme/kit', 'pdf')
    expect(existsSync(join(ws, 'habilidades', 'video', 'clips', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(ws, 'habilidades', 'pdf', 'SKILL.md'))).toBe(true)
    expect(installedSkills()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'clips', video: true }), expect.objectContaining({ name: 'pdf' })]))
    expect(installedSkills().find((x) => x.name === 'pdf')?.video).toBeUndefined()
    removeSkill('clips')
    expect(existsSync(join(ws, 'habilidades', 'video', 'clips'))).toBe(false)
  })
})
