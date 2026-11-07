# Guía de modelos y agentes para kywai

Investigación del **11 de octubre de 2026**, con fuentes al final. Es la base de las fichas que ve el coordinador
(`src/shared/defaults.ts`), del catálogo de modelos (`src/shared/modelCatalog.ts`) y del esfuerzo por dificultad.
Las cifras cambian con cada versión de los modelos: conviene repasarla cada pocos meses.

## 1. Lo esencial

- **Un solo agente que escribe es lo más rápido** para una pieza de código (una app, un script). Repartir un
  trabajo encadenado empeora entre un 39 y un 70 % (Google Research) y gasta muchos más tokens (Anthropic: unas 15
  veces los de un chat con varios agentes). Se reparte solo lo que va **a la vez y sin depender**.
- **Validar con pruebas automáticas, no con revisiones encadenadas.** Si hace falta revisar, una sola revisión, de
  otra familia de modelos y solo si la tarea es de riesgo (Cognition, 2026).
- **El esfuerzo es la palanca más grande de tiempo.** El mismo encargo con Opus 5.5 tardó 16 / 22 / 33 / 79 min en
  esfuerzo low / medium / high / max. «Max» casi nunca compensa.
- **Los modelos pequeños no son más rápidos como agentes de código**: dan más vueltas. GPT-6.1 Sol con esfuerzo
  bajo hace una tarea fácil en 8,6 min (nota 57); GPT-6 Luna, en 21,4 min (nota 41).

## 2. Qué usa kywai en cada dificultad

| Agente | Fácil | Normal | Difícil |
|---|---|---|---|
| **Claude** | Sonnet 5.5, esfuerzo medio (respuestas de texto: Haiku 5.5) | Sonnet 5.5, esfuerzo alto | Opus 5.5, esfuerzo alto |
| **Codex** | GPT-6.1 Sol, esfuerzo medio (respuestas de texto: GPT-6 Luna) | GPT-6.1 Sol, esfuerzo alto | GPT-6.1 Sol, esfuerzo muy alto (xhigh) |
| **Gemini** | 3.8 Flash (respuestas de texto: 3.5 Flash-Lite) | 3.8 Flash | 3.8 Flash |
| **Local** | su modelo | — | — (no recibe trabajo pesado) |

- Planificar: esfuerzo alto (el plan condiciona todo lo demás).
- Desde el 13-10-2026 la calidad manda sobre la velocidad: lo normal va con esfuerzo alto (unos 50 % más de tiempo
  que con medio, según la medición de arriba) y nunca se usa «low» en trabajo sobre el proyecto.
- Gemini CLI no deja cambiar el razonamiento por tarea (fuerza «HIGH» en todos los Gemini 3).
- Nunca se usa «max» ni «ultra»: minutos solo para empezar y poca mejora.

## 3. Para qué es mejor cada uno

| Tarea | Mejor | Alternativa | Por qué |
|---|---|---|---|
| App completa | **Codex (GPT-6.1 Sol, medium)**: ~11 min y ~0,70 $ por tarea | Claude Sonnet 5.5 | Mejor calidad por minuto (Artificial Analysis, índice de agentes de código) |
| Interfaces y diseño visual | **Claude Opus 5.5** (1.º en WebDev Arena) | Sonnet 5.5 (más barato) | LMArena WebDev, 8-10-2026 |
| Backend y algoritmos difíciles | **Claude Opus 5.5** (1.º en Terminal-Bench 4.0) | GPT-6.1 Sol | Vals, Artificial Analysis |
| Depurar y hacer pasar pruebas | Empate: **GPT-6.1 Sol** (73 % DeepSWE, más rápido y barato) y **Sonnet 5.5** (72 %) | — | Artificial Analysis |
| Entender código grande o desconocido | **Claude** (Sonnet/Opus 5.5: 66–67 %) | GPT-6.1 Sol (61 %) | SWE-Atlas-QnA |
| Documentos enormes | **Opus 5.5** (83 % AA-LCR) / **Gemini 3.1 Pro** (solo de pago) | GPT-6.1 Sol (82 %) | Todos admiten 1M de tokens |
| Textos en español | **Claude** (2.º, 6.º y 8.º en la clasificación en español) | Gemini Flash | GPT-6 queda muy abajo (77.º–92.º) |
| Resúmenes, traducciones rápidas | **Gemini 3.5 Flash-Lite** (~430 t/s) / **Haiku 5.5** | Modelo local | Muy rápidos y baratos |
| Formatear, extraer, clasificar | **Modelo local** (gratis) | Haiku 5.5 | Solo tareas cortas |

## 4. Fichas de los modelos

### Claude (Claude Code)

| Modelo | Velocidad | Precio API ($/M entrada/salida) | Para qué | Evitar |
|---|---|---|---|---|
| Haiku 5.5 | ~170–230 t/s | 0,10 / 0,50 | Resúmenes, clasificación, subtareas de texto | Programar como agente (Terminal-Bench 39 %) |
| Sonnet 5.5 | ~100 t/s, primer token en ~1 s | 2 / 10 | Casi todo: features, bugs, interfaces, documentos | Trabajo abierto que exige mucho juicio |
| Opus 5.5 | ~80 t/s | 4 / 20 | Lo difícil: refactor grande, depuración dura, interfaces cuidadas | Tareas triviales (varias veces la cuota de Sonnet) |
| Fable 5.1 | ~55–67 t/s | 10 / 50 | Razonamiento muy exigente | **En Pro se cobra con créditos desde el primer mensaje** (y sin preguntar en modo `-p`); en Max gasta su propia cuota semanal. Opus 5.5 le gana en casi todo |

- Esfuerzo: `--effort low|medium|high|xhigh|max` (por defecto, medium). La variable `CLAUDE_CODE_EFFORT_LEVEL`
  manda sobre la opción: kywai fija las dos.
- Límites del plan: ventana de 5 h y semanal, compartidas con Claude; Fable tiene además la suya en Max.

### Codex (cuenta de ChatGPT)

| Modelo | Velocidad | Créditos por token (relativo) | Para qué | Evitar |
|---|---|---|---|---|
| GPT-6 Luna | ~140 t/s | 1/20 de Sol | Tareas cortas y concretas, respuestas de texto | Terminal en varios pasos (Terminal-Bench 13 %) |
| GPT-6.1 Sol | ~58–74 t/s; ~11 min por tarea de código (medium) | 1 | Casi todo: apps, depuración, refactor, agentes largos | — |
| GPT-6 Sol | ~88–107 t/s | 1 | Superado por 6.1 Sol | — |
| GPT-6 Astra | ~50 t/s; ~29 min por tarea | 5 veces Sol | Solo si 6.1 Sol en xhigh no basta | Casi siempre: 6.1 Sol en xhigh lo iguala con menos del 15 % del coste |

- Esfuerzo: `-c model_reasoning_effort=low|medium|high|xhigh|max|ultra` (por defecto, medium). «Ultra» lanza sus
  propios subagentes: no conviene con el reparto de kywai.
- Plan «prolite» = Pro de 100 $: sin ventana de 5 h, con límite semanal. «Fast» gasta 2,5 veces más.

### Gemini (Gemini CLI)

| Modelo | Velocidad | Precio API | Nivel gratuito | Para qué |
|---|---|---|---|---|
| 3.8 Flash | ~128 t/s, muy verboso | 0,75 / 3,75 | Sí | El mejor Gemini para código y terminal |
| 3.5 Flash-Lite | ~430 t/s | 0,30 / 2,50 | Sí | Resúmenes, traducciones, tareas sencillas |
| 3.1 Flash-Lite | ~345 t/s | 0,25 / 1,50 | Sí | Igual, pero programa peor |
| 3.1 Pro | ~120 t/s, ~24 s hasta el primer token | 2 / 12 | **No** | Documentos larguísimos, investigación |

- Desde el 18-6-2026, Gemini CLI solo funciona con **clave de API** (o cuentas profesionales). Con clave gratuita:
  solo Flash y Flash-Lite, unas 250 peticiones al día y **sin búsqueda en Google**.
- «Auto» puede intentar Pro, que no tiene nivel gratuito: kywai fija 3.8 Flash.

### Modelos locales (Mac mini M4 de 16 GB)

| Modelo | Velocidad medida | Contexto realista | Para qué |
|---|---|---|---|
| Gemma 4 E4B | ~34 t/s | 16K o más | Formatear, extraer, clasificar |
| Gemma 4 12B QAT | ~12–18 t/s | 8–16K | Algo más capaz, lento |
| Qwen3 14B | ~12 t/s | 8K (como mucho 16K) | Lento: solo tareas cortas |

- Muy por debajo de la nube en razonamiento y en contexto largo; poco fiables con herramientas en varios pasos.
- Un prompt de 10.000 tokens tarda ~17 s (E4B) a ~85 s (Qwen3 14B) solo en empezar a responder.

## 5. Hermes y OmniRoute

- **Hermes Agent** (Nous Research) no tiene un planificador propio: es un bucle de modelo y herramientas. Comprime
  el contexto al llegar a la mitad de la ventana.
- **OmniRoute sí recorta los mensajes** (modos Aggressive y Ultra, y envejecimiento de turnos). Por eso Hermes decía
  que «el encargo llegó truncado». Se evita desactivando la compresión en OmniRoute (o en «safe»). Con Hermes delante
  hay doble compresión: conviene apagar una de las dos.

## Fuentes (consultadas el 11-10-2026)

- Anthropic: modelos (platform.claude.com/docs/en/about-claude/models/overview), anuncios de Opus 5.5 (22-9),
  Sonnet 5.5 (28-9), Haiku 5.5 (7-10) y Fable 5.1 (1-9); esfuerzo (platform.claude.com/docs/en/build-with-claude/effort;
  claude.dev/blog/spending-your-effort, 25-9); Claude Code (code.claude.com/docs/en/model-config, /cli-reference);
  planes (support.claude.com/en/articles/15424964 y 11145838).
- OpenAI: modelos y precios (learn.chatgpt.com/docs/models, /pricing, /config-file/config-reference); Artificial
  Analysis sobre GPT-6 Astra (9-9) y GPT-6.1 Sol por esfuerzo; DeepLearning.AI «Sol nearly eclipses Astra».
- Google: modelos, precios y límites (ai.google.dev/gemini-api/docs/models, /pricing, /rate-limits); anuncio de
  Gemini 3.8 Flash (2-9); código y documentación de Gemini CLI (github.com/google-gemini/gemini-cli); cuotas de la CLI
  (geminicli.com/docs/resources/quota-and-pricing, 18-6).
- Locales: model cards de Gemma 4 y Qwen3 (Hugging Face); benchmarks en Mac mini M4 de 16 GB (omlx.ai).
- Comparativas: Artificial Analysis (clasificación general y de agentes de código, Claude Code frente a Codex);
  LMArena (WebDev, texto, español; 8-10-2026); Vals.
- Varios agentes: Google Research arXiv 2512.08296; Anthropic «multi-agent research system» (13-6-2025), «building
  effective agents» (19-12-2024), «building a C compiler» (5-2-2026); Cognition «Don't build multi-agents»
  (12-6-2025) y «Multi-Agents: What's Actually Working» (22-4-2026); OpenAI «A practical guide to building agents».
- Hermes Agent (hermes-agent.nousresearch.com/docs) y OmniRoute (guía de compresión en github.com/diegosouzapw/OmniRoute).

Sin verificar: calidad en español de Haiku, Luna y Gemini Flash; SWE-bench de la familia 5.5 (solo agregadores);
límites gratuitos exactos de la clave de Gemini.
