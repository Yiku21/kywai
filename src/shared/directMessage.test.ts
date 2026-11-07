import { describe, expect, it } from 'vitest'
import { mentionMatches, mentionQuery, mentionText, parseDirect } from './directMessage'

const agents = [
  { id: 'qwen', name: 'Qwen' },
  { id: 'lmstudio', name: 'LM Studio' },
  { id: 'claude', name: 'Claude' },
  { id: 'hermes', name: 'Hermes' }
]

describe('parseDirect', () => {
  it('reconoce @Agente y deja el texto tal cual', () => {
    expect(parseDirect('@Qwen hola, ¿qué tal?', agents)).toEqual({ agentId: 'qwen', text: 'hola, ¿qué tal?' })
    expect(parseDirect('  @qwen: línea 1\nlínea 2  ', agents)).toEqual({ agentId: 'qwen', text: 'línea 1\nlínea 2' })
  })

  it('admite nombres con espacios, sin espacios y el id', () => {
    expect(parseDirect('@LM Studio escribe un poema', agents)).toEqual({ agentId: 'lmstudio', text: 'escribe un poema' })
    expect(parseDirect('@LMStudio escribe', agents)).toEqual({ agentId: 'lmstudio', text: 'escribe' })
    expect(parseDirect('@lmstudio escribe', agents)).toEqual({ agentId: 'lmstudio', text: 'escribe' })
  })

  it('reconoce /directo, /direct y /dm', () => {
    expect(parseDirect('/directo Claude revisa esto', agents)).toEqual({ agentId: 'claude', text: 'revisa esto' })
    expect(parseDirect('/DM hermes hola', agents)).toEqual({ agentId: 'hermes', text: 'hola' })
  })

  it('un nombre tiene que acabar ahí', () => {
    expect(parseDirect('@Qwen3 hola', agents)).toBeNull()
  })

  it('un @ que no es un agente sigue siendo un mensaje normal', () => {
    expect(parseDirect('@alguien mira esto', agents)).toBeNull()
    expect(parseDirect('Escribe a yo@correo.com', agents)).toBeNull()
    expect(parseDirect('Pregunta a @Qwen', agents)).toBeNull()
  })

  it('/directo con un agente que no existe es un error', () => {
    expect(parseDirect('/directo Nadie hola', agents)).toEqual({ error: 'Nadie' })
  })

  it('sin mensaje detrás, el texto queda vacío', () => {
    expect(parseDirect('@Qwen', agents)).toEqual({ agentId: 'qwen', text: '' })
  })
})

describe('sugerencias al escribir @', () => {
  it('sabe cuándo se está escribiendo el agente', () => {
    expect(mentionQuery('@')).toEqual({ prefix: '@', query: '' })
    expect(mentionQuery('@Qw')).toEqual({ prefix: '@', query: 'Qw' })
    expect(mentionQuery('/directo cl')).toEqual({ prefix: '/directo ', query: 'cl' })
    expect(mentionQuery('@Qwen hola')).toBeNull()
    expect(mentionQuery('hola @Qw')).toBeNull()
  })

  it('filtra por el principio del nombre, de una palabra o del id', () => {
    expect(mentionMatches('', agents).length).toBe(4)
    expect(mentionMatches('stu', agents).map((a) => a.id)).toEqual(['lmstudio'])
    expect(mentionMatches('lm', agents).map((a) => a.id)).toEqual(['lmstudio'])
    expect(mentionMatches('h', agents).map((a) => a.id)).toEqual(['hermes'])
  })

  it('al elegir, deja el nombre sin espacios y un espacio detrás', () => {
    expect(mentionText('@', agents[1])).toBe('@LMStudio ')
    expect(mentionText('/directo ', agents[0])).toBe('/directo Qwen ')
    expect(parseDirect(`${mentionText('@', agents[1])}hola`, agents)).toEqual({ agentId: 'lmstudio', text: 'hola' })
  })
})
