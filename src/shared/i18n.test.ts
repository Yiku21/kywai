// El motor en inglés: los textos que arma por partes (días, rutinas, resumen de herramientas) salen en inglés,
// y a los agentes se les pide escribir en inglés lo que verá el usuario.
import { afterEach, describe, expect, it } from 'vitest'
import { replyLanguage, setCurrentLang, tr, userLanguageName } from './i18n'
import { describeTrigger, describeWhen, parseRoutineCommand } from './routines'
import { toolsSummary } from './work'

describe('motor en inglés', () => {
  afterEach(() => setCurrentLang('es'))

  it('en español no cambia nada', () => {
    expect(describeTrigger({ type: 'weekly', days: [1, 3, 5], time: '09:00' })).toBe('Lunes, miércoles y viernes a las 09:00')
    expect(toolsSummary({ command: 3, read: 1 })).toBe('Ejecutó 3 comandos y leyó un archivo')
    expect(replyLanguage()).toBe('Responde en español.')
  })

  it('arma las frases en inglés', () => {
    setCurrentLang('en')
    expect(describeTrigger({ type: 'weekly', days: [1, 3, 5], time: '09:00' })).toBe('Monday, Wednesday and Friday at 09:00')
    expect(describeTrigger({ type: 'weekly', days: [1, 2, 3, 4, 5], time: '08:30' })).toBe('Monday to Friday at 08:30')
    expect(describeTrigger({ type: 'interval', hours: 6 })).toBe('Every 6 hours')
    const now = new Date(2026, 10, 6, 12, 0).getTime()
    expect(describeWhen(new Date(2026, 10, 7, 9, 0).getTime(), now)).toBe('tomorrow at 09:00')
    expect(toolsSummary({ command: 3, read: 1 })).toBe('Ran 3 commands and read a file')
    expect(tr('Cambios guardados: {files} archivo{v2} (+{add} −{del}). Se pueden ver y deshacer desde el chat.', { files: 2, v2: 's', add: 5, del: 1 })).toBe(
      'Changes saved: 2 files (+5 −1). They can be viewed and undone from the chat.'
    )
    expect(parseRoutineCommand('/routine')).toEqual({ error: expect.stringContaining('/routine every day at 9:00') })
  })

  it('pide a los agentes escribir en inglés', () => {
    setCurrentLang('en')
    expect(replyLanguage()).toContain('inglés')
    expect(userLanguageName()).toBe('inglés')
  })
})
