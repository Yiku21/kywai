import { describe, expect, it } from 'vitest'
import { cleanAnswers, extractQuestions, formatAnswers, hideQuestionsBlock, normalizeQuestions } from './agentQuestions'

const answer = [
  'He revisado la tarea. Te dejo 2 preguntas para decidir.',
  '',
  '```preguntas',
  '[{"pregunta": "¿Qué proveedores puede elegir el Contact Agent?", "opciones": [{"titulo": "Cualquiera", "detalle": "Todos los proveedores y sedes"}, {"titulo": "Solo telemedicina", "detalle": "Solo agendas de telemedicina", "recomendada": true}]},',
  ' {"pregunta": "¿Puede cancelar la cita que agendó?", "opciones": ["Sí", "No"]}]',
  '```'
].join('\n')

describe('preguntas del agente', () => {
  it('saca el bloque del texto y entiende las opciones', () => {
    const r = extractQuestions(answer)!
    expect(r.text).toBe('He revisado la tarea. Te dejo 2 preguntas para decidir.')
    expect(r.questions).toHaveLength(2)
    expect(r.questions[0].options[1]).toEqual({ label: 'Solo telemedicina', detail: 'Solo agendas de telemedicina', recommended: true })
    expect(r.questions[1].options.map((o) => o.label)).toEqual(['Sí', 'No'])
  })

  it('acepta el formato en inglés y deja una sola recomendada', () => {
    const q = normalizeQuestions({ questions: [{ question: '¿Para quién es?', options: [{ label: 'A', recommended: true }, { label: 'B', recommended: true }] }] })
    expect(q[0].options.filter((o) => o.recommended)).toHaveLength(1)
  })

  it('sin bloque o con JSON roto deja el texto como está', () => {
    expect(extractQuestions('Hola')).toBeNull()
    expect(extractQuestions('Texto\n```preguntas\n[{"pregunta": \n```')).toBeNull()
    // Una pregunta con una sola opción no es una pregunta con opciones.
    expect(extractQuestions('x\n```preguntas\n[{"pregunta": "¿Seguro?", "opciones": ["Sí"]}]\n```')).toBeNull()
  })

  it('mientras se escribe, el bloque a medias no se ve', () => {
    expect(hideQuestionsBlock('Te pregunto:\n```preguntas\n[{"preg')).toBe('Te pregunto:')
    expect(hideQuestionsBlock(answer)).toBe('He revisado la tarea. Te dejo 2 preguntas para decidir.')
  })

  it('arma la respuesta con cada pregunta, lo elegido, lo escrito y lo omitido', () => {
    const { questions } = extractQuestions(answer)!
    const answers = cleanAnswers(questions, [{ choice: 1 }, { text: 'Solo si avisa al paciente' }])
    expect(answers).toEqual([{ choice: 1 }, { text: 'Solo si avisa al paciente' }])
    const text = formatAnswers(questions, answers, 'Sin respuesta', 'Mis respuestas:')
    expect(text).toContain('1. ¿Qué proveedores puede elegir el Contact Agent?\n   → Solo telemedicina (Solo agendas de telemedicina)')
    expect(text).toContain('2. ¿Puede cancelar la cita que agendó?\n   → Solo si avisa al paciente')
    expect(formatAnswers(questions, cleanAnswers(questions, [{ choice: 9 }]), 'Sin respuesta', 'R:')).toContain('Sin respuesta')
  })
})
