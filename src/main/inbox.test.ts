// La bandeja escribe cada aviso en todos los idiomas de la app: el motor del servidor puede ir en inglés y el
// escritorio en español (o al revés), y cada uno lo lee en el suyo.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { setCurrentLang, tl } from '@shared/i18n'
import { localizeInbox, needsYou } from '@shared/inbox'
import { addInbox, initInbox } from './inbox'

describe('bandeja en el idioma de quien la lee', () => {
  afterEach(() => setCurrentLang('es'))

  it('guarda el aviso en cada idioma, con los huecos traducidos dentro', () => {
    initInbox(mkdtempSync(join(tmpdir(), 'inbox-')))
    setCurrentLang('en')
    const item = addInbox({
      kind: 'verify-failed',
      title: tl('Requiere intervención: {byName} sigue viendo fallos en «{title}»', { byName: 'Claude', title: 'Guía' }),
      detail: [tl('{fixes} {v2}{v3}. Los archivos se quedan: puedes abrirlos o deshacer la tarea.', { fixes: 2, v2: tl('correcciones'), v3: '' }), '', 'notas del agente'],
      actions: [{ id: 'dismiss', label: tl('Lo reviso yo') }]
    })
    // El servidor en inglés lo escribe en inglés…
    expect(item.title).toBe('Needs intervention: Claude still sees failures in «Guía»')
    // …pero el escritorio en español lo lee en español, también los huecos y los botones.
    const es = localizeInbox(item, 'es')
    expect(es.title).toBe('Requiere intervención: Claude sigue viendo fallos en «Guía»')
    expect(es.detail).toBe('2 correcciones. Los archivos se quedan: puedes abrirlos o deshacer la tarea.\n\nnotas del agente')
    expect(es.actions[0].label).toBe('Lo reviso yo')
    // Lo que escribió el agente va igual en todos.
    expect(localizeInbox(item, 'fr').detail).toContain('notas del agente')
  })

  it('el título de «Terminado» también se traduce', () => {
    initInbox(mkdtempSync(join(tmpdir(), 'inbox-')))
    const item = addInbox({ kind: 'done', title: tl('Terminado ({name}): {request}', { name: 'Homelab', request: 'revisa todo' }) })
    expect(item.title).toBe('Terminado (Homelab): revisa todo')
    expect(localizeInbox(item, 'en').title).toBe('Done (Homelab): revisa todo')
    expect(localizeInbox(item, 'en').actions[0].label).toBe('Got it')
  })

  it('«Te necesita» es solo lo que espera algo de ti', () => {
    expect(needsYou({ kind: 'done' })).toBe(false)
    for (const kind of ['plan', 'question', 'stalled', 'mac-permission', 'verify-failed', 'conflict', 'failed', 'paused', 'budget'] as const) expect(needsYou({ kind })).toBe(true)
  })
})
