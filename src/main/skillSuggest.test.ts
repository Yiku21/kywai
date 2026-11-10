import { describe, expect, it } from 'vitest'
import type { SkillCatalogItem } from '@shared/extensions'
import type { ChatMessage } from '@shared/types'
import { pickSkillSuggestions, proposedBefore, skillQueryKey } from './skillSuggest'
import { parsePlan } from './plan'

const item = (source: string, skillId: string, installs: number, verified = false): SkillCatalogItem => ({ source, skillId, name: skillId, installs, verified })

describe('habilidades que sugiere Hermes', () => {
  it('quita las instaladas, las ya propuestas y las que casi nadie usa; primero las de confianza y las más instaladas', () => {
    const found = [
      item('alguien/raro', 'pdf-forms', 3),
      item('otro/repo', 'pdf-tools', 900),
      item('anthropics/skills', 'pdf', 40, true),
      item('mas/uno', 'pdf-ocr', 5000),
      item('ya/tengo', 'nextjs', 10_000),
      item('ya/vista', 'pdf-merge', 7000)
    ]
    const seen = new Set(['ya/vista/pdf-merge'])
    const out = pickSkillSuggestions(found, ['NextJS'], seen)
    expect(out.map((x) => x.skillId)).toEqual(['pdf', 'pdf-ocr', 'pdf-tools'])
    expect(out[0]).toEqual({ source: 'anthropics/skills', skillId: 'pdf', name: 'pdf', installs: 40, verified: true })
    // Las que salen quedan como vistas: otra búsqueda no las repite.
    expect(pickSkillSuggestions(found, ['NextJS'], seen)).toEqual([])
  })

  it('recuerda qué búsquedas y habilidades salieron ya en el proyecto', () => {
    const msgs = [
      { id: '1', text: '', skillProposal: { status: 'dismissed', query: 'PDF  Forms', items: [{ source: 'A/b', skillId: 'c', name: 'c', installs: 1, verified: false }] } },
      { id: '2', text: 'hola' }
    ] as unknown as ChatMessage[]
    const { keys, queries } = proposedBefore(msgs)
    expect([...keys]).toEqual(['a/b/c'])
    expect(queries.has(skillQueryKey('pdf forms'))).toBe(true)
    expect(queries.has(skillQueryKey('nextjs'))).toBe(false)
  })

  it('el plan trae la búsqueda en "skills" (corta y en una línea)', () => {
    expect(parsePlan('{"reply":"ok","tasks":[],"skills":"  landing\\n page   copy "}').skills).toBe('landing page copy')
    expect(parsePlan('{"reply":"ok","tasks":[]}').skills).toBe('')
    expect(parsePlan('texto libre').skills).toBe('')
    expect(parsePlan(`{"reply":"ok","tasks":[],"skills":"${'x'.repeat(200)}"}`).skills).toHaveLength(80)
  })
})
