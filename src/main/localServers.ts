// Busca en este equipo otros servidores de modelos locales con API compatible con OpenAI (llama.cpp, KoboldCpp, Jan,
// LocalAI, vLLM…), además de LM Studio, Ollama y Colibri, que tienen su propio motor. Se mira cada puerto conocido en
// 127.0.0.1 (GET /v1/models, sin tocar nada) y lo que responde se ofrece en la tarjeta del motor «Colibri» con un
// botón «Usar»: kywai guarda esa dirección y el agente local trabaja con ese servidor. Idea de los estudios de IA
// local que detectan solos los motores que ya tienes; reimplementada aquí.
import type { LocalServerFound } from '@shared/types'

/** Los puertos de fábrica de cada servidor (en el orden en que se enseñan). */
export const KNOWN_LOCAL_SERVERS: readonly { port: number; name: string }[] = [
  // 8080 lo usan también llamafile, LocalAI y mlx_lm.server: el nombre se afina con lo que responde.
  { port: 8080, name: 'llama.cpp' },
  { port: 5001, name: 'KoboldCpp' },
  { port: 1337, name: 'Jan' },
  { port: 5000, name: 'text-generation-webui' },
  { port: 4891, name: 'GPT4All' },
  { port: 8000, name: 'vLLM' },
  { port: 30000, name: 'SGLang' },
  { port: 4000, name: 'LiteLLM' }
]

/** Nombres que se reconocen en «owned_by» de /v1/models (pesa más que el puerto). */
const OWNERS: [RegExp, string][] = [
  [/llama\.?cpp/i, 'llama.cpp'],
  [/llamafile/i, 'llamafile'],
  [/kobold/i, 'KoboldCpp'],
  [/vllm/i, 'vLLM'],
  [/sglang/i, 'SGLang'],
  [/localai/i, 'LocalAI'],
  [/mlx/i, 'MLX'],
  [/gpt4all|nomic/i, 'GPT4All'],
  [/tabby/i, 'TabbyAPI'],
  [/jan\b/i, 'Jan'],
  [/litellm/i, 'LiteLLM']
]

/** Qué servidor es, por lo que dice de sus modelos o, si no, por su puerto. */
export function identifyServer(port: number, models: { id?: unknown; owned_by?: unknown }[]): string {
  for (const m of models) {
    const owner = typeof m.owned_by === 'string' ? m.owned_by : ''
    const hit = OWNERS.find(([re]) => re.test(owner))
    if (hit) return hit[1]
  }
  return KNOWN_LOCAL_SERVERS.find((s) => s.port === port)?.name ?? `localhost:${port}`
}

/** Lee la respuesta de /v1/models (null si no es la de un servidor compatible con OpenAI). */
export function parseModelList(json: unknown): { id: string; owned_by?: string }[] | null {
  const j = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  if (!j || !Array.isArray(j.data)) return null
  return j.data
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && typeof (m as Record<string, unknown>).id === 'string')
    .map((m) => ({ id: String(m.id).slice(0, 120), ...(typeof m.owned_by === 'string' ? { owned_by: m.owned_by } : {}) }))
}

/**
 * Los servidores que responden ahora en este equipo, a la vez y con poco tiempo de espera (un puerto cerrado contesta
 * enseguida). `skip`: direcciones que ya son de otro motor.
 */
export async function detectLocalServers(opts: { fetcher?: typeof fetch; timeoutMs?: number; skip?: string[] } = {}): Promise<LocalServerFound[]> {
  const fetcher = opts.fetcher ?? fetch
  const skip = new Set(opts.skip ?? [])
  const found = await Promise.all(
    KNOWN_LOCAL_SERVERS.map(async ({ port }): Promise<LocalServerFound | null> => {
      const url = `http://127.0.0.1:${port}`
      if (skip.has(url)) return null
      try {
        const res = await fetcher(`${url}/v1/models`, { signal: AbortSignal.timeout(opts.timeoutMs ?? 1500) })
        if (!res.ok) return null
        const models = parseModelList(await res.json())
        if (!models) return null
        return { name: identifyServer(port, models), url, models: models.map((m) => m.id).slice(0, 20) }
      } catch {
        return null
      }
    })
  )
  return found.filter((f): f is LocalServerFound => !!f)
}
