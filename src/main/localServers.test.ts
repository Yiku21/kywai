import { describe, expect, it } from 'vitest'
import { KNOWN_LOCAL_SERVERS, detectLocalServers, identifyServer, parseModelList } from './localServers'

const reply = (body: unknown, ok = true): Response => ({ ok, json: async () => body }) as unknown as Response

describe('otros servidores locales', () => {
  it('reconoce el servidor por lo que dice de sus modelos y, si no, por su puerto', () => {
    expect(identifyServer(8080, [{ id: 'qwen3-8b.gguf', owned_by: 'llamacpp' }])).toBe('llama.cpp')
    expect(identifyServer(8080, [{ id: 'x', owned_by: 'localai' }])).toBe('LocalAI')
    expect(identifyServer(8000, [{ id: 'Qwen/Qwen3-8B', owned_by: 'vllm' }])).toBe('vLLM')
    expect(identifyServer(5001, [{ id: 'koboldcpp/model' }])).toBe('KoboldCpp')
    expect(identifyServer(1337, [])).toBe('Jan')
    expect(identifyServer(9999, [])).toBe('localhost:9999')
    expect(KNOWN_LOCAL_SERVERS.map((s) => s.port)).not.toContain(11434)
    expect(KNOWN_LOCAL_SERVERS.map((s) => s.port)).not.toContain(1234)
  })

  it('solo vale la respuesta de un servidor compatible con OpenAI', () => {
    expect(parseModelList({ object: 'list', data: [{ id: 'a', owned_by: 'me' }, { nope: 1 }, null] })).toEqual([{ id: 'a', owned_by: 'me' }])
    expect(parseModelList({ data: [] })).toEqual([])
    expect(parseModelList('<html>')).toBeNull()
    expect(parseModelList({ models: [] })).toBeNull()
  })

  it('mira todos los puertos a la vez, sin los que ya son de otro motor, y devuelve los que responden', async () => {
    const asked: string[] = []
    const fetcher = (async (url: string) => {
      asked.push(url)
      if (url.startsWith('http://127.0.0.1:8080/')) return reply({ data: [{ id: 'gemma-3-12b', owned_by: 'llamacpp' }] })
      if (url.startsWith('http://127.0.0.1:1337/')) return reply({ data: [{ id: 'jan-nano' }, { id: 'qwen3-4b' }] })
      if (url.startsWith('http://127.0.0.1:5000/')) return reply({ error: 'no' }, false)
      if (url.startsWith('http://127.0.0.1:4000/')) return reply('<html>')
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const found = await detectLocalServers({ fetcher, skip: ['http://127.0.0.1:8000'] })
    expect(found).toEqual([
      { name: 'llama.cpp', url: 'http://127.0.0.1:8080', models: ['gemma-3-12b'] },
      { name: 'Jan', url: 'http://127.0.0.1:1337', models: ['jan-nano', 'qwen3-4b'] }
    ])
    expect(asked.every((u) => u.endsWith('/v1/models'))).toBe(true)
    expect(asked.some((u) => u.includes(':8000'))).toBe(false)
  })
})
