import { describe, expect, it } from 'vitest'
import { insertMention, mentionMatches, mentionQuery, mentionText, parseDirect } from './directMessage'

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
    expect(parseDirect('Escribe a qwen@correo.com y a usuario@Qwen', agents)).toBeNull()
    expect(parseDirect('Mira `@Qwen` en el código', agents)).toBeNull()
    expect(parseDirect('Revisa esto\n```\n@Claude\n```', agents)).toBeNull()
  })

  it('la mención también vale en medio o al final del mensaje', () => {
    expect(parseDirect('Revisa el archivo y dime qué ves @Claude', agents)).toEqual({ agentId: 'claude', text: 'Revisa el archivo y dime qué ves', inline: true })
    expect(parseDirect('Revisa el archivo, @Claude.', agents)).toEqual({ agentId: 'claude', text: 'Revisa el archivo.', inline: true })
    expect(parseDirect('Pregunta a @Qwen qué opina del plan', agents)).toEqual({ agentId: 'qwen', text: 'Pregunta a Qwen qué opina del plan', inline: true })
    expect(parseDirect('Escribe un poema (@LMStudio)', agents)).toEqual({ agentId: 'lmstudio', text: 'Escribe un poema (LMStudio)', inline: true })
    expect(parseDirect('¿Lo miras tú, @Qwen?', agents)).toEqual({ agentId: 'qwen', text: '¿Lo miras tú?', inline: true })
    expect(parseDirect('Manda el informe a yo@correo.com @Claude', agents)).toEqual({ agentId: 'claude', text: 'Manda el informe a yo@correo.com', inline: true })
  })

  it('dos agentes distintos: va a Hermes, que reparte', () => {
    expect(parseDirect('@Qwen escribe y @Claude revisa', agents)).toBeNull()
    expect(parseDirect('Que lo haga @Qwen y lo revise @Claude', agents)).toBeNull()
    expect(parseDirect('@Qwen escribe y luego repásalo tú, @Qwen', agents)).toEqual({ agentId: 'qwen', text: 'escribe y luego repásalo tú', inline: true })
  })

  it('un nombre seguido de más letras no es el agente', () => {
    expect(parseDirect('Abre @Qwen.ts y @Claudio', agents)).toBeNull()
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
    expect(mentionQuery('@')).toMatchObject({ prefix: '@', query: '' })
    expect(mentionQuery('@Qw')).toMatchObject({ prefix: '@', query: 'Qw' })
    expect(mentionQuery('/directo cl')).toMatchObject({ prefix: '/directo ', query: 'cl' })
    expect(mentionQuery('@Qwen hola')).toBeNull()
  })

  it('también en medio del mensaje, donde esté el cursor', () => {
    expect(mentionQuery('revisa esto @Qw')).toEqual({ prefix: '@', query: 'Qw', start: 12, end: 15 })
    expect(mentionQuery('revisa esto @')).toEqual({ prefix: '@', query: '', start: 12, end: 13 })
    expect(mentionQuery('pregunta a @ qué opina', 12)).toEqual({ prefix: '@', query: '', start: 11, end: 12 })
    expect(mentionQuery('pregunta a @Qw', 13)).toBeNull()
    expect(mentionQuery('escribe a yo@cor')).toBeNull()
    expect(mentionQuery('mira `@Qw')).toEqual({ prefix: '@', query: 'Qw', start: 6, end: 9 })
    expect(mentionQuery('mira `@Qw` y')).toBeNull()
  })

  it('al elegir en medio, el nombre queda donde estaba lo escrito', () => {
    const text = 'pregunta a @q qué opina'
    const q = mentionQuery(text, 13)!
    expect(insertMention(text, q, agents[0])).toEqual({ text: 'pregunta a @Qwen qué opina', caret: 17 })
    const end = 'revisa esto @cl'
    expect(insertMention(end, mentionQuery(end)!, agents[2])).toEqual({ text: 'revisa esto @Claude ', caret: 20 })
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
