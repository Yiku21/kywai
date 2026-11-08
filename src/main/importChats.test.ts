// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentConfig } from '@shared/types'
import * as store from './projects'
import { exportSessions, initAgentSessions, lastSession } from './agentSessions'
import { listConversations, openConversation } from './conversations'
import { DatabaseSync } from 'node:sqlite'
import { importArchive, importLocal, initImports, parseChatGpt, parseClaudeAi, parseClaudeCode, parseCodex, readHermesDb, scanImports, ZipReader } from './importChats'

let root = ''
let home = ''
let work = ''
const SID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const TID = '0b6f1c2e-3d4a-4f5b-8c6d-7e8f9a0b1c2d'

const agents = [
  { id: 'claude', name: 'Claude', provider: 'claude' },
  { id: 'codex', name: 'Codex', provider: 'codex' }
] as AgentConfig[]

const jsonl = (lines: unknown[]): string => lines.map((l) => JSON.stringify(l)).join('\n') + '\n'

function claudeSession(cwd: string): string {
  return jsonl([
    { type: 'summary', summary: 'Arreglar el login', leafUuid: 'x' },
    { type: 'user', cwd, sessionId: SID, timestamp: '2026-10-01T10:00:00Z', message: { role: 'user', content: '<command-name>/clear</command-name>' } },
    { type: 'user', cwd, sessionId: SID, timestamp: '2026-10-01T10:00:01Z', message: { role: 'user', content: 'El login falla <system-reminder>interno</system-reminder>con tildes' } },
    { type: 'assistant', cwd, timestamp: '2026-10-01T10:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Miro el código.' }, { type: 'tool_use', name: 'Read', input: {} }] } },
    { type: 'user', cwd, timestamp: '2026-10-01T10:00:06Z', message: { role: 'user', content: [{ type: 'tool_result', content: 'archivo' }] } },
    { type: 'assistant', cwd, timestamp: '2026-10-01T10:00:09Z', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'Edit' }, { type: 'tool_use', name: 'Edit' }] } },
    { type: 'assistant', cwd, isSidechain: true, timestamp: '2026-10-01T10:00:10Z', message: { role: 'assistant', content: [{ type: 'text', text: 'sub-agente' }] } },
    { type: 'assistant', cwd, timestamp: '2026-10-01T10:00:12Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Arreglado.' }] } }
  ]) + '{"type":"user","cwd'
}

function codexSession(cwd: string): string {
  return jsonl([
    { timestamp: '2026-10-02T09:00:00Z', type: 'session_meta', payload: { id: TID, timestamp: '2026-10-02T09:00:00Z', cwd } },
    { timestamp: '2026-10-02T09:00:00Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>\n<cwd>/x</cwd>\n</environment_context>' }] } },
    { timestamp: '2026-10-02T09:00:01Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Añade pruebas' }] } },
    { timestamp: '2026-10-02T09:00:01Z', type: 'event_msg', payload: { type: 'user_message', message: 'Añade pruebas' } },
    { timestamp: '2026-10-02T09:00:03Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{}' } },
    { timestamp: '2026-10-02T09:00:05Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hechas.' }] } }
  ])
}

const chatGpt = [
  {
    id: 'gpt-1',
    title: 'Receta de pan',
    create_time: 1_760_000_000.5,
    update_time: 1_760_000_100,
    current_node: 'c',
    mapping: {
      root: { id: 'root', parent: null, children: ['a'], message: null },
      a: { id: 'a', parent: 'root', children: ['b', 'old'], message: { author: { role: 'user' }, create_time: 1_760_000_001, content: { content_type: 'multimodal_text', parts: [{ content_type: 'image_asset_pointer', asset_pointer: 'file-service://file-ABC123' }, '¿Cómo hago pan?'] } } },
      old: { id: 'old', parent: 'a', children: [], message: { author: { role: 'assistant' }, content: { content_type: 'text', parts: ['Rama descartada'] } } },
      b: { id: 'b', parent: 'a', children: ['c'], message: { author: { role: 'assistant' }, recipient: 'python', content: { content_type: 'code', text: 'print(1)' } } },
      c: { id: 'c', parent: 'b', children: [], message: { author: { role: 'assistant' }, recipient: 'all', create_time: 1_760_000_050, content: { content_type: 'text', parts: ['Harina, agua y sal.'] } } }
    }
  }
]

const claudeConvs = [
  {
    uuid: 'conv-1',
    name: 'Plan del libro',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T11:00:00Z',
    project_uuid: 'proj-1',
    chat_messages: [
      { sender: 'human', text: 'Ayúdame con el índice', created_at: '2026-09-01T10:00:00Z', attachments: [{ file_name: 'notas.txt', extracted_content: '…' }] },
      { sender: 'assistant', text: '', content: [{ type: 'text', text: 'Propongo 10 capítulos.' }], created_at: '2026-09-01T10:01:00Z' }
    ]
  },
  { uuid: 'conv-2', name: '', created_at: '2026-09-02T10:00:00Z', chat_messages: [{ sender: 'human', text: 'Suelta' }] }
]
const claudeProjects = [
  { uuid: 'proj-1', name: 'Mi libro', prompt_template: 'Escribe en tono cercano', docs: [{ filename: 'estilo.md', content: '# Estilo' }] },
  { uuid: 'starter', name: 'How to use Claude', is_starter_project: true, docs: [] }
]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kywai-importar-test-'))
  home = join(root, 'home')
  work = join(root, 'obras', 'web')
  mkdirSync(work, { recursive: true })
  mkdirSync(join(root, 'ws'), { recursive: true })
  store.initProjects(join(root, 'ws'))
  initAgentSessions(join(root, 'ws'))
  initImports(join(root, 'ws'), home)
  vi.stubEnv('CLAUDE_CONFIG_DIR', '')
  vi.stubEnv('CODEX_HOME', '')
  vi.stubEnv('HERMES_HOME', join(home, '.hermes'))
  vi.stubEnv('XDG_CONFIG_HOME', join(home, '.config'))
  const cdir = join(home, '.claude', 'projects', work.replace(/[^A-Za-z0-9]/g, '-'))
  mkdirSync(cdir, { recursive: true })
  writeFileSync(join(cdir, `${SID}.jsonl`), claudeSession(work))
  writeFileSync(join(cdir, 'agent-1234.jsonl'), claudeSession(work))
  const xdir = join(home, '.codex', 'sessions', '2026', '10', '02')
  mkdirSync(xdir, { recursive: true })
  writeFileSync(join(xdir, `rollout-2026-10-02T09-00-00-${TID}.jsonl`), codexSession(work))
})

afterEach(() => {
  vi.unstubAllEnvs()
  store.flushAll()
  rmSync(root, { recursive: true, force: true })
})

describe('leer cada app', () => {
  it('Claude Code: solo lo que escribió el usuario y las respuestas, con las herramientas contadas', () => {
    const c = parseClaudeCode(claudeSession('/w'), SID)
    expect(c.title).toBe('Arreglar el login')
    expect(c.cwd).toBe('/w')
    expect(c.turns.map((t) => [t.role, t.text])).toEqual([
      ['user', 'El login falla con tildes'],
      ['assistant', 'Miro el código.\n\nArreglado.']
    ])
    expect(c.turns[1].tools).toEqual({ Read: 1, Edit: 2 })
  })

  it('Codex: sin el contexto del entorno ni los eventos repetidos', () => {
    const c = parseCodex(codexSession('/w'))
    expect(c.sourceId).toBe(TID)
    expect(c.cwd).toBe('/w')
    expect(c.turns.map((t) => [t.role, t.text])).toEqual([
      ['user', 'Añade pruebas'],
      ['assistant', 'Hechas.']
    ])
    expect(c.turns[1].tools).toEqual({ shell: 1 })
  })

  it('ChatGPT: la rama visible, sin llamadas a herramientas, con las imágenes', () => {
    const [c] = parseChatGpt(chatGpt)
    expect(c.title).toBe('Receta de pan')
    expect(c.createdAt).toBe(1_760_000_000_500)
    expect(c.turns.map((t) => t.text)).toEqual(['¿Cómo hago pan?', 'Harina, agua y sal.'])
    expect(c.turns[0].images).toEqual(['file-ABC123'])
  })

  it('Claude.ai: mensajes, adjuntos nombrados y proyectos (sin el de ejemplo)', () => {
    const r = parseClaudeAi(claudeConvs, claudeProjects)
    expect(r.conversations[0].turns.map((t) => t.text)).toEqual(['Ayúdame con el índice\n\n📎 notas.txt', 'Propongo 10 capítulos.'])
    expect(r.conversations[0].sourceProject).toBe('proj-1')
    expect(r.conversations[1].title).toBe('Suelta')
    expect(r.projects).toEqual([{ uuid: 'proj-1', name: 'Mi libro', instructions: 'Escribe en tono cercano', docs: [{ name: 'estilo.md', content: '# Estilo' }] }])
  })

  it('lee zips comprimidos y sin comprimir', () => {
    const file = join(root, 'a.zip')
    writeFileSync(file, zipSync({ 'x/conversations.json': strToU8('[1]'), 'plano.txt': [strToU8('hola'), { level: 0 }] }))
    const z = new ZipReader(file)
    expect(z.data(z.find((n) => n.endsWith('conversations.json'))!).toString()).toBe('[1]')
    expect(z.data(z.find((n) => n === 'plano.txt')!).toString()).toBe('hola')
    z.close()
  })
})

describe('importar', () => {
  it('encuentra las sesiones de este equipo por carpeta (sin los sub-agentes)', () => {
    const scan = scanImports()
    const cc = scan.sources.find((s) => s.kind === 'claude-code')!
    expect(cc.folders).toHaveLength(1)
    expect(cc.folders[0]).toMatchObject({ cwd: work, name: 'web', exists: true })
    expect(cc.folders[0].sessions.map((s) => s.id)).toEqual([`claude-code:${SID}`])
    expect(scan.sources.find((s) => s.kind === 'codex')!.folders[0].sessions[0].id).toBe(`codex:${TID}`)
  })

  it('crea un proyecto con esa carpeta, la conversación se retoma con la sesión real y no se duplica', () => {
    scanImports()
    const r = importLocal([`claude-code:${SID}`, `codex:${TID}`], agents)
    expect(r).toMatchObject({ conversations: 2, projectsCreated: 1, resumable: 2 })
    const [projectId] = r.projectIds
    expect(store.getProject(projectId).project.workDir).toBe(work)
    const convs = listConversations(projectId).filter((c) => !c.current)
    expect(convs.map((c) => c.importedFrom).sort()).toEqual(['Claude Code', 'Codex'])
    const cc = convs.find((c) => c.importedFrom === 'Claude Code')!
    openConversation(projectId, cc.id)
    const st = store.getProject(projectId)
    expect(st.messages.map((m) => m.text)).toEqual(['El login falla con tildes', 'Miro el código.\n\nArreglado.\n\n_🔧 Read · Edit ×2_'])
    expect(st.messages[1].author).toEqual({ type: 'agent', agentId: 'claude' })
    expect(exportSessions(projectId).claude.sessionId).toBe(SID)
    // Se retoma aunque tenga más de 14 días.
    expect(lastSession(projectId, 'claude', { provider: 'claude', cwd: work }, Date.parse('2026-11-30'))?.sessionId).toBe(SID)

    expect(scanImports().sources[0].folders[0].sessions[0].imported).toBe(true)
    expect(importLocal([`claude-code:${SID}`], agents)).toMatchObject({ conversations: 0, skipped: 1, projectsCreated: 0 })
  })

  it('usa el proyecto que ya trabaja en esa carpeta y, sin agente de ese programa, solo se puede leer', () => {
    const p = store.createProject('Mi web')
    store.setWorkDir(p.id, work)
    const scan = scanImports()
    expect(scan.sources[0].folders[0].projectId).toBe(p.id)
    const r = importLocal([`claude-code:${SID}`], [])
    expect(r).toMatchObject({ conversations: 1, projectsCreated: 0, resumable: 0, projectIds: [p.id] })
    const conv = listConversations(p.id).find((c) => c.importedFrom)!
    openConversation(p.id, conv.id)
    expect(store.getProject(p.id).messages[1]).toMatchObject({ author: { type: 'agent', agentId: 'Claude Code' }, importedFrom: 'Claude Code' })
  })

  it('rechaza tamaños declarados enormes y rutas fuera del ZIP antes de reservar memoria', () => {
    const file = join(root, 'limites.zip')
    const bytes = Buffer.from(zipSync({ 'conversations.json': strToU8('[]') }))
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    bytes.writeUInt32LE(512 * 1024 * 1024, central + 24)
    writeFileSync(file, bytes)
    const zip = new ZipReader(file)
    try {
      expect(() => zip.data(zip.entries[0])).toThrow(/límites/)
      expect(() => zip.data({ ...zip.entries[0], size: 2, offset: 2 ** 50 })).toThrow(/zip válido/)
    } finally { zip.close() }
    // Directorio central falsificado: no se reserva el tamaño indicado por el archivo.
    const end = bytes.length - 22
    bytes.writeUInt32LE(1024 * 1024 * 1024, end + 12)
    writeFileSync(file, bytes)
    expect(() => new ZipReader(file)).toThrow(/límites/)
  })

  it('ChatGPT: zip con imágenes a un proyecto «ChatGPT», y otra vez no duplica', () => {
    const file = join(root, 'chatgpt.zip')
    writeFileSync(file, zipSync({ 'conversations.json': strToU8(JSON.stringify(chatGpt)), 'file-ABC123-foto.png': new Uint8Array([137, 80, 78, 71]) }))
    const r = importArchive(file, agents)
    expect(r).toMatchObject({ kind: 'chatgpt', conversations: 1, projectsCreated: 1 })
    const pid = r.projectIds[0]
    expect(store.getProject(pid).project.name).toBe('ChatGPT')
    const conv = listConversations(pid).find((c) => c.importedFrom === 'ChatGPT')!
    openConversation(pid, conv.id)
    const m = store.getProject(pid).messages
    expect(m[0].attachments?.[0].relPath).toMatch(/^attachments\/imp-file-ABC123-/)
    expect(existsSync(join(store.projectDir(pid), m[0].attachments![0].relPath))).toBe(true)
    expect(m[1]).toMatchObject({ importedFrom: 'ChatGPT', text: 'Harina, agua y sal.' })
    expect(importArchive(file, agents)).toMatchObject({ conversations: 0, skipped: 1, projectsCreated: 0 })
  })

  it('conserva mensajes de más de 40.000 caracteres sin recortarlos al guardar', () => {
    const text = 'Texto de ejemplo '.repeat(4000) + 'Final conservado'
    const file = join(root, 'largo.json')
    writeFileSync(file, JSON.stringify([{ id: 'long-example', title: 'Texto completo', current_node: 'message', mapping: { message: { parent: null, message: { author: { role: 'user' }, content: { content_type: 'text', parts: [text] } } } } }]))
    const result = importArchive(file, agents)
    const projectId = result.projectIds[0]
    const conversation = listConversations(projectId).find(c => c.importedFrom)!
    openConversation(projectId, conversation.id)
    expect(store.getProject(projectId).messages[0].text).toBe(text)
  })

  it('Claude.ai: sus proyectos con instrucciones y documentos; lo suelto a «Claude.ai»', () => {
    const file = join(root, 'claude.zip')
    writeFileSync(file, zipSync({ 'conversations.json': strToU8(JSON.stringify(claudeConvs)), 'projects.json': strToU8(JSON.stringify(claudeProjects)) }))
    const r = importArchive(file, agents)
    expect(r).toMatchObject({ kind: 'claude-ai', conversations: 2, projectsCreated: 2, documents: 1 })
    const book = store.listProjects().find((p) => p.name === 'Mi libro')!
    const st = store.getProject(book.id)
    expect(st.instructions).toBe('Escribe en tono cercano')
    expect(readFileSync(join(st.project.dir, 'documentos', 'estilo.md'), 'utf8')).toBe('# Estilo')
    expect(st.artifacts.map((a) => a.relPath)).toContain('documentos/estilo.md')
    expect(listConversations(book.id).some((c) => c.title === 'Plan del libro')).toBe(true)
    expect(store.listProjects().some((p) => p.name === 'Claude.ai')).toBe(true)
    expect(store.listProjects().some((p) => p.name === 'How to use Claude')).toBe(false)
  })

  it('un archivo que no es una exportación se rechaza con un motivo claro', () => {
    const file = join(root, 'otro.zip')
    writeFileSync(file, zipSync({ 'leeme.txt': strToU8('x') }))
    expect(() => importArchive(file, agents)).toThrow(/conversations-000\.zip/)
    const json = join(root, 'conversations.json')
    writeFileSync(json, JSON.stringify([{ foo: 1 }]))
    expect(() => importArchive(json, agents)).toThrow(/No reconozco.*campos: foo/)
  })

  it('Claude.ai partida en varios zips: elegidos a la vez, por su manifiesto o solo el de conversaciones', () => {
    const dir = join(root, 'descargas')
    mkdirSync(dir, { recursive: true })
    const convZip = join(dir, 'conversations-000.zip')
    const projZip = join(dir, 'projects-000.zip')
    // Las conversaciones en una carpeta, una por archivo; los proyectos en un projects.json.
    writeFileSync(convZip, zipSync({ 'conversations/conv-1.json': strToU8(JSON.stringify(claudeConvs[0])), 'conversations/conv-2.json': strToU8(JSON.stringify(claudeConvs[1])) }))
    writeFileSync(projZip, zipSync({ 'projects.json': strToU8(JSON.stringify(claudeProjects)), 'projects/proj-1/docs/estilo.json': strToU8('{}') }))
    writeFileSync(join(dir, 'memories-000.zip'), zipSync({ 'memories.json': strToU8('[]') }))
    const manifest = join(dir, 'manifest-x.json')
    const files = ['conversations-000.zip', 'projects-000.zip', 'memories-000.zip', 'frames-000.zip'].map((filename, i) => ({ batch_index: i, export_url: 'https://claude.ai/export/x', filename }))
    writeFileSync(manifest, JSON.stringify({ version: '1.0', total_files: 4, data_files: files }))
    // Por el manifiesto (los zips al lado; el que falta se ignora).
    expect(importArchive(manifest, agents)).toMatchObject({ kind: 'claude-ai', conversations: 2, projectsCreated: 2, documents: 1 })
    expect(store.listProjects().some((p) => p.name === 'Mi libro')).toBe(true)
    // Elegidos a la vez, otra vez: no duplica.
    expect(importArchive([convZip, projZip], agents)).toMatchObject({ conversations: 0, skipped: 2 })
    // Un zip que no lleva conversaciones dice cuál elegir; el manifiesto solo, también.
    expect(() => importArchive(join(dir, 'memories-000.zip'), agents)).toThrow(/conversations-000\.zip/)
    const lone = join(root, 'manifest-solo.json')
    writeFileSync(lone, JSON.stringify({ data_files: files }))
    expect(() => importArchive(lone, agents)).toThrow(/misma carpeta que el manifiesto/)
  })
})

describe('Hermes (también Hermes Desktop)', () => {
  function hermesDb(): string {
    const dir = join(home, '.hermes')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, 'state.db')
    const db = new DatabaseSync(file)
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT, cwd TEXT, started_at REAL, ended_at REAL, parent_session_id TEXT, end_reason TEXT, hidden INTEGER DEFAULT 0);
      CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL NOT NULL, _compressed_summary INTEGER);`)
    const ses = db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const msg = db.prepare('INSERT INTO messages (session_id, role, content, tool_calls, tool_name, timestamp, _compressed_summary) VALUES (?, ?, ?, ?, ?, ?, ?)')
    // Del usuario, en una carpeta, compactada en dos sesiones.
    ses.run('local-a', 'local', 'Identificar proveedor', work, 1_762_000_000, 1_762_000_100, null, 'compression', 0)
    ses.run('local-a2', 'local', null, work, 1_762_000_101, 1_762_000_200, 'local-a', null, 0)
    msg.run('local-a', 'user', '¿Qué proveedor usas?', null, null, 1_762_000_001, null)
    msg.run('local-a', 'assistant', '', '[{"id":"c1","function":{"name":"skill_view"}}]', null, 1_762_000_002, null)
    msg.run('local-a', 'tool', '{"success": true}', null, 'skill_view', 1_762_000_003, null)
    msg.run('local-a', 'assistant', 'Uso el proveedor custom.', null, null, 1_762_000_004, null)
    msg.run('local-a2', 'user', 'Resumen de lo anterior', null, null, 1_762_000_101, 1)
    msg.run('local-a2', 'user', '¿Y cuál es custom?', null, null, 1_762_000_102, null)
    msg.run('local-a2', 'assistant', 'OmniRoute.', null, null, 1_762_000_103, null)
    // Por Telegram, sin carpeta.
    ses.run('tg-1', 'telegram', 'Lista de la compra', null, 1_762_100_000, null, null, null, 0)
    msg.run('tg-1', 'user', 'Apunta leche', null, null, 1_762_100_001, null)
    msg.run('tg-1', 'assistant', 'Apuntada.', null, null, 1_762_100_002, null)
    // Encargo de kywai: no se importa.
    ses.run('one-1', 'oneshot', 'Planificar coordinación', work, 1_762_200_000, null, null, null, 0)
    msg.run('one-1', 'user', 'Eres Hermes, el coordinador de un equipo de agentes de IA que trabajan juntos en el proyecto "x".', null, null, 1_762_200_001, null)
    // Trabajo en la carpeta interna de un proyecto de kywai, y una oculta: tampoco.
    ses.run('int-1', 'oneshot', 'Interna', join(root, 'ws', 'projects', 'proyecto-x'), 1_762_300_000, null, null, null, 0)
    msg.run('int-1', 'user', 'hola', null, null, 1_762_300_001, null)
    ses.run('hid-1', 'local', 'Oculta', work, 1_762_400_000, null, null, null, 1)
    msg.run('hid-1', 'user', 'secreto', null, null, 1_762_400_001, null)
    db.close()
    return file
  }

  it('junta las sesiones compactadas, cuenta las herramientas y deja fuera lo de kywai y lo oculto', () => {
    const convs = readHermesDb(hermesDb(), true)
    expect(convs.map((c) => c.sourceId).sort()).toEqual(['local-a', 'tg-1'])
    const a = convs.find((c) => c.sourceId === 'local-a')!
    expect(a.cwd).toBe(work)
    expect(a.turns.map((t) => [t.role, t.text])).toEqual([
      ['user', '¿Qué proveedor usas?'],
      ['assistant', 'Uso el proveedor custom.'],
      ['user', '¿Y cuál es custom?'],
      ['assistant', 'OmniRoute.']
    ])
    expect(a.turns[1].tools).toEqual({ skill_view: 1 })
    expect(a.updatedAt).toBe(1_762_000_200_000)
  })

  it('sale en «En este equipo» y lo que no tiene carpeta va a un proyecto «Hermes»', () => {
    hermesDb()
    const src = scanImports().sources.find((x) => x.kind === 'hermes')!
    expect(src.folders.map((f) => f.cwd).sort()).toEqual(['', work])
    const r = importLocal(['hermes:local-a', 'hermes:tg-1'], [...agents, { id: 'hermes', name: 'Hermes', provider: 'hermes' } as AgentConfig])
    expect(r).toMatchObject({ conversations: 2, resumable: 0 })
    const hermesProject = store.listProjects().find((p) => p.name === 'Hermes')!
    const conv = listConversations(hermesProject.id).find((c) => c.importedFrom === 'Hermes')!
    openConversation(hermesProject.id, conv.id)
    expect(store.getProject(hermesProject.id).messages.map((m) => m.text)).toEqual(['Apunta leche', 'Apuntada.'])
    expect(store.getProject(hermesProject.id).messages[1].author).toEqual({ type: 'agent', agentId: 'hermes' })
    expect(importLocal(['hermes:local-a'], agents)).toMatchObject({ conversations: 0, skipped: 1 })
  })
})

describe('solo lo que empezó el usuario', () => {
  const claudeAt = (cwd: string, id: string, text: string): void => {
    const dir = join(home, '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'))
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, `${id}.jsonl`),
      jsonl([
        { type: 'user', cwd, sessionId: id, timestamp: '2026-11-01T10:00:00Z', message: { role: 'user', content: text } },
        { type: 'assistant', cwd, timestamp: '2026-11-01T10:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Vale.' }] } }
      ])
    )
  }
  const desktopIndex = (file: string, o: Record<string, unknown>): void => {
    const dir = join(home, '.config', 'Claude', 'claude-code-sessions', 'cuenta', 'org')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, file), JSON.stringify(o))
  }
  const listed = (): string[] =>
    scanImports()
      .sources.flatMap((x) => x.folders.flatMap((f) => f.sessions.map((c) => c.id)))
      .sort()

  it('deja fuera los encargos de kywai, el control a distancia, las revisiones automáticas y las pruebas', () => {
    claudeAt(work, 'k1', 'Eres Claude, parte de un equipo de agentes de IA que trabajan juntos en el proyecto "x".')
    claudeAt(work, 'k2', 'Eres Becario (becario de Codex), parte de un equipo de agentes de IA que trabajan juntos.')
    claudeAt(join(root, 'ws', 'aislado', 'abc'), 'k3', 'Comprueba la web')
    claudeAt('/Users/alguien/Library/Application Support/AI Cowork/workspace/projects/borrado-xyz', 'k4', 'Haz la tarea')
    claudeAt(work, 'k5', '<wake reason="mention"><project id="p">hola</project></wake>')
    claudeAt(work, 'k6', 'Responde solo: ok')
    claudeAt(work, 'u1', 'Quiero cambiar el color del botón')
    expect(listed()).toEqual([`claude-code:${SID}`, 'claude-code:u1', `codex:${TID}`])
  })

  it('usa el título y la carpeta de la app Claude, sin las borradas ni las carpetas temporales', () => {
    const scratch = join(root, 'tmp', 'scratch-2026-11-06-5ba214')
    mkdirSync(scratch, { recursive: true })
    claudeAt(scratch, 'd1', 'Hazme un logo')
    desktopIndex('local_a.json', { sessionId: 'local_a', cliSessionId: 'd1', cwd: work, originCwd: work, title: 'Logo de colibrí' })
    claudeAt(scratch, 'd2', 'Una pregunta suelta')
    desktopIndex('local_b.json', { sessionId: 'local_b', cliSessionId: 'd2', cwd: scratch, title: 'Pregunta suelta' })
    claudeAt(work, 'd3', 'Esto lo borré')
    desktopIndex('deleted_c.json', { sessionId: 'local_c', cliSessionId: 'd3', cwd: work, title: 'Borrada' })
    const folders = scanImports().sources.find((x) => x.kind === 'claude-code')!.folders
    const byCwd = Object.fromEntries(folders.map((f) => [f.cwd, f.sessions.map((c) => c.title).sort()]))
    expect(byCwd).toEqual({ [work]: ['Arreglar el login', 'Logo de colibrí'], '': ['Pregunta suelta'] })
    const r = importLocal(['claude-code:d1', 'claude-code:d2'], agents)
    expect(r).toMatchObject({ conversations: 2, resumable: 1 })
    expect(store.listProjects().some((p) => p.name === 'Claude Code')).toBe(true)
  })
})
