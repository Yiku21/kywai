// Mensaje directo («@Agente …») al modelo de LM Studio, contra un servidor falso en el puerto de LM Studio.
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentConfig } from '@shared/types'
import { runLmStudio } from './lmstudio'

type Msg = { role: string; content: string | null; reasoning_content?: string; tool_calls?: unknown[] }

// Un solo servidor para todas las pruebas (fetch reutiliza la conexión): cada prueba pone sus respuestas.
let server: Server
let replies: Msg[] = []
let got: Record<string, unknown>[] = []
beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server = createServer((req, res) => {
        if (req.url?.startsWith('/v1/models')) return void res.writeHead(200, { 'content-type': 'application/json' }).end('{"data":[{"id":"qwen"}]}')
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          got.push(JSON.parse(body))
          const message = replies.shift() ?? { role: 'assistant', content: '' }
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 5, completion_tokens: 5 } }))
        })
      })
      server.listen(1234, '127.0.0.1', () => resolve())
    })
)
afterAll(() => new Promise<void>((r) => server.close(() => r())))

/** Responde con `list` en orden y devuelve lo que recibe cada vez. */
async function fakeLmStudio(list: Msg[]): Promise<Record<string, unknown>[]> {
  replies = list
  got = []
  return got
}

const agent = { id: 'qwen', name: 'Qwen', provider: 'lmstudio', model: 'qwen' } as AgentConfig
const run = (direct = true) =>
  runLmStudio({ agent, model: 'qwen', prompt: 'hola, preséntate', cwd: process.cwd(), mode: 'work', signal: new AbortController().signal, direct })

describe('mensaje directo a LM Studio', () => {
  it('va solo con tu texto: sin mensaje de sistema y sin herramientas', async () => {
    const got = await fakeLmStudio([{ role: 'assistant', content: 'Hola, soy Qwen.' }])
    const r = await run()
    expect(r).toMatchObject({ ok: true, text: 'Hola, soy Qwen.' })
    expect(got[0].messages).toEqual([{ role: 'user', content: 'hola, preséntate' }])
    expect(got[0].tools).toBeUndefined()
  })

  it('si la plantilla ya abrió <think>, lo de antes de </think> es razonamiento y no se pierde la respuesta', async () => {
    await fakeLmStudio([{ role: 'assistant', content: 'pienso un poco…</think>\n\nHola, soy Qwen.' }])
    expect(await run()).toMatchObject({ ok: true, text: 'Hola, soy Qwen.' })
  })

  it('si solo razona, se le pide la respuesta una vez', async () => {
    const got = await fakeLmStudio([
      { role: 'assistant', content: '', reasoning_content: 'Debo presentarme.' },
      { role: 'assistant', content: 'Hola, soy Qwen.' }
    ])
    expect(await run()).toMatchObject({ ok: true, text: 'Hola, soy Qwen.' })
    expect(got).toHaveLength(2)
    expect((got[1].messages as Msg[]).at(-1)).toEqual({ role: 'user', content: 'Escribe ahora tu respuesta.' })
  })

  it('si tampoco entonces escribe, se enseña lo que razonó', async () => {
    await fakeLmStudio([
      { role: 'assistant', content: '<think>Debo presentarme.</think>' },
      { role: 'assistant', content: '' }
    ])
    const r = await run()
    expect(r.ok).toBe(true)
    expect(r.text).toMatch(/no escribió ninguna respuesta; esto es lo que razonó:\n\nDebo presentarme\./)
  })

  it('sin texto ni razonamiento, falla diciéndolo claramente', async () => {
    await fakeLmStudio([{ role: 'assistant', content: '' }, { role: 'assistant', content: '' }])
    expect(await run()).toMatchObject({ ok: false, errorMessage: expect.stringMatching(/terminó sin escribir ninguna respuesta/) })
  })

  it('una tarea normal sigue con su mensaje de sistema y sus herramientas', async () => {
    const got = await fakeLmStudio([{ role: 'assistant', content: 'Hecho.' }])
    expect(await run(false)).toMatchObject({ ok: true, text: 'Hecho.' })
    expect((got[0].messages as Msg[])[0].role).toBe('system')
    expect(Array.isArray(got[0].tools)).toBe(true)
  })
})
