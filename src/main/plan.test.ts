import { describe, expect, it } from 'vitest'
import { isPlanApproval, parsePlan, streamlinePlan, twoHandsPlan, wantsNoReview, wantsOneHand, wantsReview, wantsSolo, wantsTeam, wantsTwoHands, WINNER_RE, type HandAgent, type HandTask, type PlanItem } from './plan'

const task = (key: string, title: string, agentId: string, dependsOn: string[] = [], difficulty: PlanItem['difficulty'] = 'hard'): PlanItem => ({
  key,
  title,
  description: `Instrucciones de ${title}`,
  agentId,
  difficulty,
  dependsOn
})

// El plan real de la prueba de la app de gastos en el Mac (49 min frente a 25 de Codex solo).
const MAC_PLAN = [
  task('t1', 'Diseñar arquitectura y contratos', 'claude'),
  task('t2', 'Implementar aplicación completa', 'codex', ['t1']),
  task('t3', 'Auditar lógica y API', 'gemini', ['t2']),
  task('t4', 'Revisar interfaz y accesibilidad', 'claude', ['t2']),
  task('t5', 'Validar requisitos de extremo a extremo', 'claude', ['t3', 't4']),
  task('t6', 'Corregir y cerrar entrega', 'codex', ['t5'])
]
const PETICION = 'Crea en una carpeta nueva llamada gastos-compartidos/ una aplicación completa… Validación con mensajes de error claros… Pruebas con node:test… "npm test" tiene que pasar entero.'

describe('plan más ágil', () => {
  it('detecta cuándo el usuario pide revisión (y no lo confunde con pruebas o validación de datos)', () => {
    expect(wantsReview(PETICION)).toBe(false)
    expect(wantsReview('Hazme la web con revisión')).toBe(true)
    expect(wantsReview('crea el script y que otro agente lo revise')).toBe(true)
    expect(wantsReview('quiero una segunda opinión sobre el diseño')).toBe(true)
    expect(wantsReview('revisa este contrato')).toBe(false)
  })

  it('detecta cuándo el usuario no quiere que se verifique el resultado', () => {
    expect(wantsNoReview(PETICION)).toBe(false)
    expect(wantsNoReview('Hazlo rápido, sin revisión')).toBe(true)
    expect(wantsNoReview('cámbialo y no lo verifiques')).toBe(true)
    expect(wantsNoReview('revisa este contrato')).toBe(false)
  })

  it('el plan del Mac se queda en una sola tarea: Codex diseña, construye y prueba', () => {
    const { tasks, changes } = streamlinePlan(MAC_PLAN, PETICION)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({ key: 't2', agentId: 'codex', difficulty: 'hard', dependsOn: [] })
    expect(tasks[0].description).toMatch(/^Antes de construir, diseñar arquitectura y contratos:/)
    expect(tasks[0].description).toContain('Instrucciones de Implementar aplicación completa')
    expect(changes).toHaveLength(5)
  })

  it('con revisión pedida se mantienen las revisiones, pero con el modelo normal', () => {
    const { tasks } = streamlinePlan(MAC_PLAN, `${PETICION} Con revisión, por favor.`)
    expect(tasks.map((t) => t.key)).toEqual(['t2', 't3', 't4', 't5', 't6'])
    expect(tasks.find((t) => t.key === 't2')!.dependsOn).toEqual([])
    expect(tasks.filter((t) => t.key !== 't2').every((t) => t.difficulty === 'medium')).toBe(true)
  })

  it('no toca un plan que ya va en paralelo, ni una revisión que es la propia petición', () => {
    const paralelo = [task('a', 'Escribir el código', 'codex'), task('b', 'Escribir la documentación', 'gemini', [], 'medium')]
    expect(streamlinePlan(paralelo, 'haz el código y la documentación').tasks).toEqual(paralelo)
    const revisar = [task('a', 'Revisar el contrato', 'claude')]
    expect(streamlinePlan(revisar, 'revisa este contrato').tasks).toEqual(revisar)
  })

  it('quien dependía de una revisión quitada pasa a depender de lo que dependía esta', () => {
    const plan = [task('a', 'Construir la API', 'codex'), task('b', 'Validar la API', 'claude', ['a']), task('c', 'Documentar la API', 'gemini', ['b'], 'medium')]
    const { tasks } = streamlinePlan(plan, 'haz una API documentada')
    expect(tasks.map((t) => [t.key, t.dependsOn])).toEqual([
      ['a', []],
      ['c', ['a']]
    ])
  })

  it('detecta cuándo se pide trabajar en equipo o con un solo agente', () => {
    expect(wantsTeam('Haz la hoja de cálculo en equipo')).toBe(true)
    expect(wantsTeam('hazlo en paralelo entre varios agentes')).toBe(true)
    expect(wantsTeam(PETICION)).toBe(false)
    expect(wantsSolo('hazlo con un solo agente')).toBe(true)
    expect(wantsSolo('que lo haga solo Codex')).toBe(true)
    expect(wantsSolo(PETICION)).toBe(false)
  })

  it('lee el contrato común del plan (texto u objeto) y la integración final no se quita', () => {
    expect(parsePlan('{"reply":"ok","contract":"motor/ exporta evaluar()","tasks":[]}').contract).toBe('motor/ exporta evaluar()')
    expect(parsePlan('{"reply":"ok","contract":{"motor":"evaluar()"},"tasks":[]}').contract).toContain('"motor": "evaluar()"')
    expect(parsePlan('{"reply":"ok","tasks":[]}').contract).toBe('')
    const team = [task('m', 'Motor de fórmulas', 'codex'), task('u', 'Interfaz', 'claude'), task('i', 'Integrar y probar', 'codex', ['m', 'u'], 'medium')]
    expect(streamlinePlan(team, 'hazlo en equipo').tasks.map((t) => t.key)).toEqual(['m', 'u', 'i'])
  })

  it('un diseño del que dependen varias tareas se mantiene (sirve para construir a la vez)', () => {
    const plan = [task('d', 'Diseñar la API', 'claude'), task('a', 'Servidor', 'codex', ['d']), task('b', 'Interfaz', 'claude', ['d'])]
    expect(streamlinePlan(plan, 'haz la app').tasks.map((t) => t.key)).toEqual(['d', 'a', 'b'])
  })
})

describe('isPlanApproval', () => {
  it('detecta cuándo se piden dos versiones para elegir, o una sola', () => {
    expect(wantsTwoHands('Hazme la landing a dos manos')).toBe(true)
    expect(wantsTwoHands('quiero dos opciones de logo')).toBe(true)
    expect(wantsTwoHands('dame varias propuestas de portada')).toBe(true)
    expect(wantsTwoHands(PETICION)).toBe(false)
    expect(wantsOneHand('hazlo a una mano')).toBe(true)
    expect(wantsOneHand('una sola versión, por favor')).toBe(true)
    expect(wantsOneHand(PETICION)).toBe(false)
  })

  it('a dos manos: otra familia hace la misma tarea en su carpeta y una tercera elige; si no aplica, el plan se queda igual', () => {
    const agents: HandAgent[] = [
      { id: 'claude', name: 'Claude', provider: 'claude' },
      { id: 'gemini', name: 'Gemini', provider: 'gemini' },
      { id: 'codex', name: 'Codex', provider: 'codex' },
      { id: 'local', name: 'Qwen', provider: 'ollama', local: true }
    ]
    const landing: HandTask = { ...task('t1', 'Landing de la panadería', 'codex'), deliverable: 'file', acceptance: 'carga sin errores', files: [], continues: false }
    const { tasks, change } = twoHandsPlan([landing], 'Hazme la landing a dos manos', agents, 'artifacts/')
    expect(tasks.map((t) => [t.key, t.agentId, t.title, t.files, t.deliverable, t.dependsOn])).toEqual([
      ['t1', 'codex', 'Landing de la panadería (opción A)', ['artifacts/opcion-a/'], 'file', []],
      ['t1-b', 'claude', 'Landing de la panadería (opción B)', ['artifacts/opcion-b/'], 'file', []],
      ['t1-juez', 'gemini', 'Elegir la mejor opción de «Landing de la panadería»', [], 'text', ['t1', 't1-b']]
    ])
    expect(tasks[0].description).toContain('Crea TODO dentro de artifacts/opcion-a/')
    expect(tasks[1].description).toContain('Codex hace la misma tarea por su cuenta')
    expect(tasks[2].description).toMatch(/opción A en artifacts\/opcion-a\/ \(de Codex\)[\s\S]*en los dos órdenes/)
    expect(WINNER_RE.exec('GANA: B\n\nPorque…')?.[1]).toBe('B')
    expect(WINNER_RE.exec('**WINNER: A**\n\nBecause…')?.[1]).toBe('A')
    expect(change).toBe('«Landing de la panadería» a dos manos: Codex (A) y Claude (B); Gemini elige')
    // Sin tercera familia, juzga el autor (y se le avisa); sin otra familia, no hay dos manos.
    const two = twoHandsPlan([landing], 'a dos manos', agents.slice(0, 1).concat(agents[2]), 'artifacts/')
    expect(two.tasks[2].agentId).toBe('codex')
    expect(two.tasks[2].description).toContain('Tú hiciste la opción A')
    expect(twoHandsPlan([landing], 'a dos manos', [agents[2], agents[3]], 'artifacts/').tasks).toHaveLength(1)
    // No aplica: no se pidió, se pidió una sola, es continuación, es solo texto o hay varias tareas.
    expect(twoHandsPlan([landing], PETICION, agents, 'artifacts/').tasks).toEqual([landing])
    expect(twoHandsPlan([landing], 'a dos manos pero a una mano', agents, 'artifacts/').tasks).toEqual([landing])
    expect(twoHandsPlan([{ ...landing, continues: true }], 'a dos manos', agents, 'artifacts/').tasks).toHaveLength(1)
    expect(twoHandsPlan([{ ...landing, deliverable: 'text' }], 'a dos manos', agents, 'artifacts/').tasks).toHaveLength(1)
    expect(twoHandsPlan([landing, { ...landing, key: 't2' }], 'a dos manos', agents, 'artifacts/').tasks).toHaveLength(2)
  })

  it('un «sí» al plan lo aprueba sin volver a planificar', () => {
    for (const t of ['Sí', 'sí, adelante', 'Ok, dale!', 'Perfecto, empieza', 'de acuerdo', 'Me parece bien, gracias', 'Vale, manos a la obra', 'adelante con el plan', 'Yes', 'yes, go ahead', 'Looks good, thanks', 'sure, start', 'LGTM'])
      expect(isPlanApproval(t), t).toBe(true)
  })
  it('cualquier cambio, duda o negativa se toma como respuesta al plan', () => {
    for (const t of ['no', 'sí, pero que lo haga Claude', 'Cambia el agente de la interfaz', '¿Cuánto tardará?', 'ok pero en TypeScript', '', 'sí sí sí sí sí sí sí sí sí', 'yes but use Claude', 'no, change the design'])
      expect(isPlanApproval(t), t).toBe(false)
  })
})
