import { parseSecretCommand } from './chatCommands'
import { describe, expect, it } from 'vitest'
import { commandSuggestions, rememberInput, REMEMBER_COMMAND } from './chatCommands'

describe('lista del «/»', () => {
  const templates = [
    { id: 't1', command: 'revisar-pr', name: 'Revisar PR', icon: '🔍' },
    { id: 't2', command: 'rutina', name: 'Choca con kywai' }
  ]
  const mods = [{ name: 'traducir', description: 'Traduce al inglés', mod: 'Traductor' }]

  it('con «/» sola salen todas: primero las de kywai, luego plantillas y mods', () => {
    const all = commandSuggestions('', { templates, mods })
    expect(all.map((c) => c.command)).toEqual(['video', 'serie', 'editar', 'recortes', 'demo', 'miniatura', 'doblar', 'sprite', 'radar', 'consejo', 'aprende', 'instagram', 'tiktok', 'ig-plan', 'ig-viral', 'ig-reel', 'turno-noche', 'ig-profile', 'ig-audit', 'ig-reply', 'ig-comment', 'rutina', 'directo', 'secreto', 'recuerda', 'model', 'uso', 'nuevo', 'revisar-pr', 'traducir'])
    expect(all.every((c) => c.description.length > 0)).toBe(true)
  })

  it('filtra por lo escrito y entiende los otros nombres', () => {
    expect(commandSuggestions('vi').map((c) => c.command)).toEqual(['video'])
    expect(commandSuggestions('usa').map((c) => c.command)).toEqual(['usage'])
    expect(commandSuggestions('re', { templates }).map((c) => c.command)).toEqual(['recortes', 'recuerda', 'revisar-pr'])
  })

  it('las que no llevan nada detrás se hacen al elegirlas', () => {
    const by = Object.fromEntries(commandSuggestions('').map((c) => [c.command, c]))
    expect(by.model.runs).toBe(true)
    expect(by.uso.runs).toBe(true)
    expect(by.video.runs).toBe(false)
    expect(by.video.args).toBe('tema')
  })

  it('una plantilla con el nombre de una orden de kywai no sale', () => {
    expect(commandSuggestions('rut', { templates }).map((c) => c.kind)).toEqual(['builtin'])
  })
})

describe('«/recuerda»', () => {
  it('reconoce la orden y el tipo de dato', () => {
    const m = REMEMBER_COMMAND.exec('/recuerda decisión: usar MIT')
    expect(m && rememberInput(m[2])).toEqual({ kind: 'decision', text: 'usar MIT' })
    expect(rememberInput('el servidor es el Mac mini')).toEqual({ kind: 'fact', text: 'el servidor es el Mac mini' })
  })
})

describe('«/secreto»', () => {
  it('saca nombre y valor de las formas habituales', () => {
    expect(parseSecretCommand('/secreto ghl-pit pit-1234-abcd')).toEqual({ name: 'GHL_PIT', value: 'pit-1234-abcd' })
    expect(parseSecretCommand('/secreto GHL_PIT = pit-1234')).toEqual({ name: 'GHL_PIT', value: 'pit-1234' })
    expect(parseSecretCommand('/secret API_KEY: sk 12 34')).toEqual({ name: 'API_KEY', value: 'sk 12 34' })
    expect(parseSecretCommand('/secreto CRED {"a":\n1}')).toEqual({ name: 'CRED', value: '{"a":\n1}' })
  })
  it('sola abre la pestaña y sin valor explica cómo', () => {
    expect(parseSecretCommand('/secreto')).toBeNull()
    expect(parseSecretCommand('/secretos  ')).toBeNull()
    expect(parseSecretCommand('/secreto GHL_PIT')).toEqual({ error: expect.stringContaining('/secreto GHL_PIT') })
    expect(parseSecretCommand('hola /secreto X y')).toBeNull()
    expect(parseSecretCommand('/secretaria algo')).toBeNull()
  })
})
