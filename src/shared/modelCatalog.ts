// Datos de cada modelo según la investigación del 11-10-2026 (fuentes en docs/GUIA-MODELOS.md): velocidad,
// coste relativo y para qué conviene. El coordinador los ve en la ficha de cada agente al repartir.
import type { Difficulty, Effort, ProviderKind } from './types'

export interface ModelFacts {
  label: string
  speed: string
  cost: string
  note?: string
}

const FACTS: Record<string, ModelFacts> = {
  // Claude (Anthropic, Artificial Analysis)
  haiku: { label: 'Haiku 5.5', speed: 'muy rápido (~170–230 t/s)', cost: 'el más barato', note: 'flojo programando como agente (Terminal-Bench 39 %)' },
  sonnet: { label: 'Sonnet 5.5', speed: 'rápido (~100 t/s)', cost: 'medio (la mitad que Opus)', note: 'casi tan bueno como Opus; en terminal incluso mejor (70,6 % frente a 66,4 %)' },
  opus: { label: 'Opus 5.5', speed: 'moderado (~80 t/s)', cost: 'alto (varias veces la cuota de Sonnet)', note: 'el mejor en interfaces (1.º en WebDev Arena) y en backend difícil' },
  fable: { label: 'Fable 5.1', speed: 'lento', cost: 'muy alto: en Pro se cobra aparte con créditos', note: 'Opus 5.5 le gana en casi todo' },
  // Codex (OpenAI, Artificial Analysis)
  'gpt-6-luna': { label: 'GPT-6 Luna', speed: 'muy rápido (~140 t/s)', cost: 'muy bajo (1/20 de Sol)', note: 'flojo en terminal (13 %): solo tareas cortas y concretas' },
  'gpt-6.1-sol': { label: 'GPT-6.1 Sol', speed: 'rápido como agente (~11 min por tarea de código)', cost: 'medio', note: 'el mejor en calidad por minuto; en xhigh iguala a Astra' },
  'gpt-6-sol': { label: 'GPT-6 Sol', speed: 'rápido', cost: 'medio', note: 'superado por GPT-6.1 Sol' },
  'gpt-6-astra': { label: 'GPT-6 Astra', speed: 'lento (~50 t/s, ~29 min por tarea)', cost: 'muy alto (5 veces la cuota de Sol)', note: 'no mejora a GPT-6.1 Sol en xhigh' },
  // Gemini (Google, Artificial Analysis)
  'gemini-3.8-flash': { label: 'Gemini 3.8 Flash', speed: 'rápido (~128 t/s), pero muy verboso', cost: 'bajo; tiene nivel gratuito', note: 'el mejor Gemini para código y terminal' },
  'gemini-3.5-flash-lite': { label: 'Gemini 3.5 Flash-Lite', speed: 'muy rápido (~430 t/s)', cost: 'muy bajo', note: 'bueno para resúmenes, traducciones y tareas sencillas' },
  'gemini-3.1-flash-lite': { label: 'Gemini 3.1 Flash-Lite', speed: 'muy rápido (~345 t/s)', cost: 'muy bajo', note: 'flojo programando: mejor 3.5 Flash-Lite' },
  'gemini-3.1-pro-preview': { label: 'Gemini 3.1 Pro', speed: 'tarda en empezar (~24 s)', cost: 'medio; solo con clave de pago', note: 'el mejor leyendo documentos larguísimos e investigando' },
  // Muse Code (Meta): sin mediciones propias todavía; datos de su documentación.
  'muse-spark-1.3': { label: 'Muse Spark 1.3', speed: 'sin medir aún', cost: 'suscripción de Muse Code (límites cada 5 h); gasta menos tokens que 1.2', note: 'contexto de 1 millón de tokens; lee imágenes, PDFs y vídeo; trabajo largo de código y varios pasos' },
  'muse-spark-1.2': { label: 'Muse Spark 1.2', speed: 'sin medir aún', cost: 'suscripción de Muse Code', note: 'pensado para código; superado por Spark 1.3' },
  'muse-spark-1.1': { label: 'Muse Spark 1.1', speed: 'sin medir aún', cost: 'suscripción de Muse Code', note: 'el más antiguo: mejor Spark 1.3' },
  // Locales (medidos en un Mac mini M4 de 16 GB)
  'google/gemma-4-e4b': { label: 'Gemma 4 E4B', speed: '~34 t/s en un Mac mini M4', cost: 'gratis', note: 'solo formatear, extraer y resúmenes cortos' },
  'google/gemma-4-12b-qat': { label: 'Gemma 4 12B', speed: '~12–18 t/s en un Mac mini M4', cost: 'gratis', note: 'algo más capaz que E4B, pero lento' },
  'qwen3:14b': { label: 'Qwen3 14B', speed: '~12 t/s en un Mac mini M4', cost: 'gratis', note: 'lento: solo tareas cortas' }
}

/** Datos conocidos de un modelo (por su nombre o alias en el CLI). */
export function modelFacts(model: string | undefined): ModelFacts | undefined {
  if (!model) return undefined
  const m = model.toLowerCase()
  return FACTS[m] ?? Object.entries(FACTS).find(([k]) => m.startsWith(k) || m.includes(`/${k}`))?.[1]
}

/**
 * Esfuerzo de razonamiento por dificultad (Claude Code, Codex y Muse Code; Gemini no lo deja cambiar por tarea).
 * La calidad manda sobre la velocidad: lo normal va con esfuerzo alto, lo fácil con medio y lo difícil con alto
 * (Claude) o muy alto (Codex). También se planifica con «high» (es la decisión que condiciona todo lo demás).
 * Medido: el mismo encargo con Opus tardó 16/22/33/79 min en low/medium/high/max; «max» sigue sin compensar
 * (minutos solo para empezar y poca mejora), así que nunca se usa.
 */
export function effortFor(provider: ProviderKind, difficulty: Difficulty): Effort | undefined {
  if (provider === 'claude') return difficulty === 'easy' ? 'medium' : 'high'
  if (provider === 'codex') return difficulty === 'easy' ? 'medium' : difficulty === 'hard' ? 'xhigh' : 'high'
  // Muse Code usa «high» por defecto; lo fácil con «medium» ahorra su pequeña cuota.
  if (provider === 'muse') return difficulty === 'easy' ? 'medium' : 'high'
  return undefined
}

/** Esfuerzo con el que se planifica: el plan decide quién hace qué y cómo se reparte, así que va con el alto. */
export function planEffortFor(provider: ProviderKind): Effort | undefined {
  return effortFor(provider, 'medium')
}

export const EFFORT_LABEL: Record<Effort, string> = { low: 'esfuerzo bajo', medium: 'esfuerzo medio', high: 'esfuerzo alto', xhigh: 'esfuerzo muy alto' }
