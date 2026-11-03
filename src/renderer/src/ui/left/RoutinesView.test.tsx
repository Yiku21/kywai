import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Routine, RoutineInput } from '@shared/types'

const fake = vi.hoisted(() => {
  const state = { calls: [] as Array<[string, ...unknown[]]>, runStatus: 'skipped' as string }
  ;(window as unknown as { cowork: unknown }).cowork = new Proxy(
    {
      createRoutine: async (pid: string, input: RoutineInput) => {
        state.calls.push(['createRoutine', pid, input])
        return { ...input, id: 'rnew', enabled: true, createdAt: 1, updatedAt: 1, scheduleFrom: 1, runs: [] }
      },
      updateRoutine: async (pid: string, id: string, patch: unknown) => {
        state.calls.push(['updateRoutine', pid, id, patch])
        return {}
      },
      runRoutineNow: async (pid: string, id: string) => {
        state.calls.push(['runRoutineNow', pid, id])
        return { at: 1, status: state.runStatus, reason: 'manual' }
      },
      getRoutineWebhook: async (pid: string, id: string, regenerate?: boolean) => {
        state.calls.push(['getRoutineWebhook', pid, id, regenerate])
        return {
          webAccess: true,
          urls: [`http://100.64.0.1:8787/hooks/${pid}/${id}/s3cr3t`],
          bareUrls: [`http://100.64.0.1:8787/hooks/${pid}/${id}`],
          secret: 's3cr3t'
        }
      }
    } as Record<string, unknown>,
    { get: (t, k: string) => t[k] ?? (async () => undefined) }
  )
  return state
})

import { useCowork } from '@/store/cowork'
import { RoutinesView } from './RoutinesView'

const routines: Routine[] = [
  {
    id: 'r1',
    name: 'Dependencias',
    request: 'Revisa las dependencias',
    enabled: true,
    trigger: { type: 'weekly', days: [1, 2, 3, 4, 5], time: '08:30' },
    createdAt: 1,
    updatedAt: 1,
    scheduleFrom: 1,
    nextAt: new Date(2030, 0, 7, 8, 30).getTime(),
    runs: [
      { at: new Date(2026, 9, 12, 8, 30).getTime(), status: 'ok', reason: 'schedule', runId: 'a' },
      { at: new Date(2026, 9, 13, 8, 30).getTime(), status: 'skipped', reason: 'catchup', note: 'No se lanzó a su hora (2 veces…)' }
    ]
  },
  { id: 'r2', name: 'PR', request: 'Revisa el PR', enabled: false, trigger: { type: 'webhook' }, createdAt: 1, updatedAt: 1, scheduleFrom: 1, hasSecret: true, nextAt: null, runs: [] }
]

let root: Root
let host: HTMLDivElement
const button = (text: string): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fake.calls.length = 0
  useCowork.setState((s) => ({
    mode: 'live',
    live: { ...s.live, project: { id: 'proyecto-1', name: 'P', dir: '/x', createdAt: 1, updatedAt: 1 }, routines }
  }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => root.render(<RoutinesView />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('pestaña Rutinas', () => {
  it('enseña cada rutina con su disparador, la próxima hora, la última ejecución y el historial', async () => {
    expect(host.textContent).toContain('Dependencias')
    expect(host.textContent).toContain('De lunes a viernes a las 08:30 · próxima')
    expect(host.textContent).toContain('Al llegar un webhook · desactivada')
    expect(host.textContent).toContain('Última: Saltada')
    await act(async () => button('Historial (2)').click())
    expect(host.textContent).toContain('No se lanzó a su hora (2 veces…)')
    expect(host.textContent).toContain('hora perdida')
    expect(host.textContent).toContain('Hecha')
  })

  it('activa y desactiva, y «Ejecutar ahora» dice si se saltó', async () => {
    await act(async () => button('Activar la rutina').click())
    expect(fake.calls).toContainEqual(['updateRoutine', 'proyecto-1', 'r2', { enabled: true }])
    await act(async () => button('Ejecutar ahora').click())
    expect(fake.calls).toContainEqual(['runRoutineNow', 'proyecto-1', 'r1'])
    expect(host.textContent).toContain('Saltada: la anterior sigue en marcha')
  })

  it('el webhook se pide al abrirlo (con su secreto) y se puede copiar', async () => {
    expect(fake.calls.some((c) => c[0] === 'getRoutineWebhook')).toBe(false)
    await act(async () => button('Webhook').click())
    expect(fake.calls).toContainEqual(['getRoutineWebhook', 'proyecto-1', 'r2', undefined])
    const url = host.querySelector('input[aria-label="Dirección del webhook"]') as HTMLInputElement
    expect(url.value).toBe('http://100.64.0.1:8787/hooks/proyecto-1/r2/s3cr3t')
    expect(button('Copiar la dirección')).toBeTruthy()
    expect(host.textContent).toContain('X-Cowork-Secret')
  })

  it('crea una rutina de días de la semana', async () => {
    await act(async () => button('Nueva rutina').click())
    await type(host.querySelector('input[placeholder="Revisión de dependencias"]') as HTMLInputElement, 'Resumen')
    await type(host.querySelector('textarea') as HTMLTextAreaElement, 'Prepara el resumen del día')
    const select = host.querySelector('select') as HTMLSelectElement
    await act(async () => {
      select.value = 'weekly'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    // Por defecto de lunes a viernes: se quita el viernes.
    await act(async () => button('viernes').click())
    expect(host.textContent).toContain('Lunes, martes, miércoles y jueves a las 09:00')
    await act(async () => button('Crear rutina').click())
    expect(fake.calls).toContainEqual([
      'createRoutine',
      'proyecto-1',
      { name: 'Resumen', request: 'Prepara el resumen del día', trigger: { type: 'weekly', time: '09:00', days: [1, 2, 3, 4] }, enabled: true }
    ])
  })
})
