import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Artifact, ChatMessage, TraceEntry } from '@shared/types'

// Motor de escritorio simulado: solo registra lo que se le pide.
const fake = vi.hoisted(() => {
  const calls: string[] = []
  const trace: TraceEntry[] = []
  const methods: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    getTaskTrace: async (id) => {
      calls.push(`trace:${id}`)
      return trace
    },
    approvePlan: async (p, m) => void calls.push(`approve:${p}:${m}`),
    rejectPlan: async (p, m) => void calls.push(`reject:${p}:${m}`),
    decideRoutineProposal: async (p, m, a) => void calls.push(`routine:${p}:${m}:${String(a)}`),
    rateMessage: async (p, m, r) => void calls.push(`rate:${p}:${m}:${String(r)}`),
    openPath: async (p, rel) => void calls.push(`open:${p}:${rel}`),
    downloadArtifacts: async (p, ids) => void calls.push(`download:${p}:${(ids as string[]).join(',')}`),
    sendMessage: async (input) => {
      calls.push(`send:${JSON.stringify(input)}`)
      return { runId: 'r-edit' }
    },
    switchMessageVersion: async (p, m, to) => void calls.push(`version:${p}:${m}:${String(to)}`),
    forkConversation: async (p, c, from) => {
      calls.push(`fork:${p}:${c}:${JSON.stringify(from)}`)
      return 'c-copia'
    },
    openConversation: async (p, c) => {
      calls.push(`openConv:${p}:${c}`)
      return { opened: c }
    }
  }
  ;(window as unknown as { cowork: unknown }).cowork = new Proxy(methods, {
    get: (t, k: string) => t[k] ?? (async () => undefined)
  })
  return { calls, trace }
})

import { useCowork } from '@/store/cowork'
import { MessageItem } from './Messages'
import { useComposer } from './composerStore'

let root: Root
let host: HTMLDivElement

const art = (id: string, relPath: string): Artifact => ({
  id,
  projectId: 'p1',
  agentId: 'codex',
  name: relPath.split('/').pop()!,
  relPath,
  kind: 'image',
  size: 10,
  createdAt: 1
})

async function show(message: ChatMessage, artifacts: Artifact[] = []): Promise<void> {
  const s = useCowork.getState()
  useCowork.setState({
    mode: 'live',
    live: { ...s.live, messages: [message], artifacts: Object.fromEntries(artifacts.map((a) => [a.id, a])) }
  })
  await act(async () => root.render(<MessageItem message={message} />))
}

const button = (text: string): HTMLButtonElement =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(text) || b.getAttribute('aria-label') === text) as HTMLButtonElement

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fake.calls.length = 0
  fake.trace.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe('chat del escritorio', () => {
  const proposal: ChatMessage = {
    id: 'm1',
    projectId: 'p1',
    runId: 'r1',
    author: { type: 'agent', agentId: 'hermes' },
    text: 'He entendido que quieres una web.',
    createdAt: 1,
    proposal: {
      status: 'pending',
      request: 'Hazme una web',
      tasks: [
        { key: 'web', title: 'Programar la web', description: 'Crea index.html', agentId: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'file' },
        { key: 'test', title: 'Probarla', description: 'Pruebas', agentId: 'claude', difficulty: 'easy', dependsOn: ['web'], deliverable: 'text' }
      ]
    }
  }

  it('un mensaje directo a un agente dice a quién fue y que no pasó por Hermes', async () => {
    await show({ id: 'md', projectId: 'p1', runId: 'r8', author: { type: 'user' }, text: 'hola', createdAt: 1, direct: { agentId: 'qwen', name: 'Qwen' } })
    expect(host.textContent).toContain('Tú → Qwen (directo, sin Hermes)')
    expect(host.querySelector('p')?.textContent).toBe('hola')
  })

  it('un mensaje que lanzó una rutina lleva «Rutina: <nombre>» y sus datos externos van plegados', async () => {
    await show({
      id: 'mr',
      projectId: 'p1',
      runId: 'r9',
      author: { type: 'user' },
      text: 'Revisa el PR que llega\n\n---\nDatos recibidos por el webhook de esta rutina…\n<<<DATOS_EXTERNOS_x\n{"number":7}\nDATOS_EXTERNOS_x>>>',
      createdAt: 1,
      routine: { id: 'rx', name: 'Revisar PRs' }
    })
    expect(host.textContent).toContain('Rutina: Revisar PRs')
    expect(host.textContent).not.toContain('Tú')
    expect(host.querySelector('p')?.textContent).toBe('Revisa el PR que llega')
    const details = host.querySelector('details')!
    expect(details.querySelector('summary')?.textContent).toBe('Datos que trajo la rutina')
    expect(details.querySelector('pre')?.textContent).toContain('{"number":7}')
  })

  it('el plan propuesto espera tu visto bueno: cada tarea con su agente y los botones avisan al motor', async () => {
    await show(proposal)
    expect(host.textContent).toContain('Plan propuesto: espera tu visto bueno')
    expect(host.textContent).toContain('2 agentes · 2 tareas')
    expect(host.textContent).toContain('Programar la web')
    expect(host.textContent).toContain('tras 1')
    await act(async () => button('Aprobar y empezar').click())
    expect(fake.calls).toEqual(['approve:p1:m1'])
    await act(async () => button('Descartar').click())
    expect(fake.calls).toEqual(['approve:p1:m1', 'reject:p1:m1'])
  })

  it('la rutina que propone Hermes se crea, se cambia en el cuadro de texto o se descarta', async () => {
    const m: ChatMessage = {
      id: 'm9',
      projectId: 'p1',
      runId: 'r9',
      author: { type: 'agent', agentId: 'hermes' },
      text: '¿Lo dejo programado?',
      createdAt: 1,
      routineProposal: { status: 'pending', name: 'Revisa los PR', request: 'revisa los PR abiertos', trigger: { type: 'daily', time: '08:30' }, command: '/rutina cada día a las 8:30: revisa los PR abiertos' }
    }
    await show(m)
    expect(host.textContent).toContain('Rutina propuesta: Revisa los PR')
    expect(host.textContent).toContain('Cada día a las 08:30')
    await act(async () => button('Crear rutina').click())
    await act(async () => button('Descartar').click())
    expect(fake.calls).toEqual(['routine:p1:m9:create', 'routine:p1:m9:dismiss'])
    await act(async () => button('Cambiar').click())
    expect(useComposer.getState().text).toBe('/rutina cada día a las 8:30: revisa los PR abiertos')
    // Creada: sin botones de decidir, con «Ver en Rutinas».
    await show({ ...m, routineProposal: { ...m.routineProposal!, status: 'created', routineId: 'r1' } })
    expect(host.textContent).toContain('Rutina creada: Revisa los PR')
    expect(button('Crear rutina')).toBeUndefined()
    await act(async () => button('Ver en Rutinas').click())
    expect(useCowork.getState().leftTab).toBe('routines')
  })

  it('un plan cambiado o descartado se queda plegado y sin botones', async () => {
    await show({ ...proposal, proposal: { ...proposal.proposal!, status: 'revised' } })
    expect(host.textContent).toContain('Plan cambiado por tu respuesta')
    expect(button('Aprobar y empezar')).toBeUndefined()
    await show({ ...proposal, proposal: { ...proposal.proposal!, status: 'rejected' } })
    expect(host.textContent).toContain('Plan descartado')
  })

  it('varios entregables van juntos en una carpeta plegada que se despliega', async () => {
    const arts = [art('a1', 'artifacts/conceptos/01.png'), art('a2', 'artifacts/conceptos/02.png'), art('a3', 'artifacts/conceptos/03.png')]
    await show({ id: 'm2', projectId: 'p1', author: { type: 'agent', agentId: 'codex' }, text: 'Listo.', createdAt: 2, artifactIds: arts.map((a) => a.id) }, arts)
    expect(host.textContent).toContain('conceptos')
    expect(host.textContent).toContain('3 archivos · 3 imágenes')
    expect(host.textContent).not.toContain('01.png')
    const toggle = host.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.textContent).toContain('01.png')
    expect(host.querySelectorAll('li').length).toBe(3)
    await act(async () => button('Abrir carpeta').click())
    expect(fake.calls).toEqual(['open:p1:artifacts/conceptos'])
    await act(async () => button('Descargar 01.png').click())
    expect(fake.calls.at(-1)).toBe('download:p1:a1')
    await act(async () => button('Descargar conceptos como zip').click())
    expect(fake.calls.at(-1)).toBe('download:p1:a1,a2,a3')
  })

  it('mientras trabaja, el chat enseña en corto qué hace y todo lo demás se despliega en tres niveles', async () => {
    const work: ChatMessage = {
      id: 'w1',
      projectId: 'p1',
      runId: 'r1',
      author: { type: 'agent', agentId: 'codex' },
      text: '',
      createdAt: 4,
      work: {
        taskId: 't1',
        title: 'Arreglar el formulario',
        status: 'running',
        steps: [
          { kind: 'note', text: 'Reviso cómo valida el formulario.' },
          {
            kind: 'tools',
            summary: 'Ejecutó un comando y leyó un archivo',
            items: ['Leyendo src/form.ts', 'Ejecutando: npm test'],
            failed: 1,
            refs: [
              { id: '1-1', tool: 'read', ok: true },
              { id: '1-2', tool: 'command', ok: false }
            ]
          },
          { kind: 'note', text: 'Falla una prueba: arreglo la comprobación del correo.' },
          { kind: 'tools', summary: 'Editó un archivo', items: ['Editando src/form.ts'], add: 3, del: 1, refs: [{ id: '1-3', tool: 'edit', ok: true, add: 3, del: 1 }] }
        ],
        totals: { summary: 'Ejecutó un comando, leyó un archivo y editó un archivo', failed: 1, add: 3, del: 1 }
      }
    }
    fake.trace.push(
      { id: '1-2', ts: 2, kind: 'tool', tool: 'command', title: 'Ejecutando: npm test', body: 'npm test', output: '1 failed: email', ok: false },
      { id: '1-3', ts: 3, kind: 'tool', tool: 'edit', title: 'Editando src/form.ts', body: 'src/form.ts\n\n- const ok = false\n+ const ok = valid(email)', ok: true }
    )
    const s = useCowork.getState()
    useCowork.setState({ live: { ...s.live, tasks: { t1: { id: 't1', status: 'running', lastActivity: 'Comprobando el correo' } as never } } })
    await show(work)

    // Nivel 1: su tarea, qué hace ahora (su última frase) y el resumen de lo hecho con su flecha.
    expect(host.textContent).toContain('Arreglar el formulario')
    expect(host.textContent).toContain('Trabajando')
    expect(host.textContent).toContain('Falla una prueba: arreglo la comprobación del correo.')
    expect(host.textContent).toContain('Ejecutó un comando, leyó un archivo y editó un archivo')
    expect(host.textContent).toContain('1 con error')
    expect(host.textContent).toContain('+3')
    expect(host.textContent).toContain('−1')
    expect(host.textContent).toContain('Comprobando el correo')
    // Lo anterior, sin desplegar, no se ve.
    expect(host.textContent).not.toContain('Reviso cómo valida el formulario.')
    expect(host.textContent).not.toContain('Ejecutando: npm test')
    expect(fake.calls).toEqual([])

    // Nivel 2: todo lo que cuenta, en orden, con cada grupo de herramientas en una línea.
    await act(async () => button('Ejecutó un comando, leyó un archivo').click())
    expect(host.textContent).toContain('Reviso cómo valida el formulario.')
    expect(host.textContent).toContain('Ejecutó un comando y leyó un archivo')
    expect(host.textContent).not.toContain('Ejecutando: npm test')
    await act(async () => button('Ejecutó un comando y leyó un archivo').click())
    expect(host.textContent).toContain('Ejecutando: npm test')

    // Nivel 3: cada herramienta se despliega con su detalle, que se pide al registro de la tarea.
    await act(async () => button('Ejecutando: npm test').click())
    expect(fake.calls).toContain('trace:t1')
    expect(host.textContent).toContain('$ npm test')
    expect(host.textContent).toContain('1 failed: email')
    await act(async () => button('Editó un archivo').click())
    await act(async () => button('Editando src/form.ts').click())
    expect(host.textContent).toContain('+ const ok = valid(email)')

    // Al acabar, su resultado va en el mismo mensaje y vuelve a verse plegado.
    await show({ ...work, text: 'Listo: ya valida el correo.', work: { ...work.work!, status: 'done' } })
    expect(host.textContent).toContain('Hecha')
    expect(host.textContent).toContain('Listo: ya valida el correo.')
    expect(host.textContent).not.toContain('Comprobando el correo')
    // El registro completo se abre desde lo desplegado.
    await act(async () => button('Abrir el registro completo').click())
    expect(useCowork.getState().trace?.taskId).toBe('t1')
  })

  it('un resultado terminado se puede valorar con 👍/👎 y volver a pulsarlo lo quita; mientras trabaja, no', async () => {
    const done: ChatMessage = {
      id: 'w2',
      projectId: 'p1',
      runId: 'r1',
      author: { type: 'agent', agentId: 'codex' },
      text: 'Listo: ya valida el correo.',
      createdAt: 5,
      work: { taskId: 't2', title: 'Arreglar el formulario', status: 'done', steps: [] }
    }
    await show(done)
    await act(async () => button('Me sirvió').click())
    expect(fake.calls).toEqual(['rate:p1:w2:up'])
    await show({ ...done, rating: 'up' })
    expect(host.textContent).toContain('Te sirvió')
    await act(async () => button('Me sirvió').click())
    expect(fake.calls).toEqual(['rate:p1:w2:up', 'rate:p1:w2:null'])
    await act(async () => button('No me sirvió').click())
    expect(fake.calls.at(-1)).toBe('rate:p1:w2:down')
    await show({ ...done, text: '', work: { ...done.work!, status: 'running' } })
    expect(button('Me sirvió')).toBeUndefined()
  })

  it('clic derecho en un mensaje tuyo → Editar: se cambia en su sitio y se reenvía en el mismo chat (editOf)', async () => {
    const mine: ChatMessage = { id: 'u7', projectId: 'p1', author: { type: 'user' }, text: 'Haz la web en azul', createdAt: 7 }
    await show(mine)
    const item = (text: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes(text))
    await act(async () => host.querySelector('article')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })))
    expect(item('Copiar')).toBeTruthy()
    expect(item('Bifurcar desde aquí')).toBeTruthy()
    await act(async () => item('Editar')!.click())
    const box = host.querySelector('textarea')!
    expect(box.value).toBe('Haz la web en azul')
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(box, 'Haz la web en verde')
      box.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button('Enviar').click())
    await act(async () => new Promise((r) => setTimeout(r, 0)))
    expect(fake.calls).toEqual(['send:{"projectId":"p1","text":"Haz la web en verde","filePaths":[],"editOf":"u7"}'])
    expect(useComposer.getState().editing).toBeNull()
    expect(fake.calls.some((c) => c.startsWith('fork'))).toBe(false)
  })

  it('el lápiz de tu mensaje abre la edición en su sitio, y Escape la cancela sin enviar nada', async () => {
    const mine: ChatMessage = { id: 'u8', projectId: 'p1', author: { type: 'user' }, text: 'Pon el logo arriba', createdAt: 8 }
    await show(mine)
    await act(async () => button('Editar').click())
    const box = host.querySelector('textarea')!
    expect(box.value).toBe('Pon el logo arriba')
    await act(async () => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.textContent).toContain('Pon el logo arriba')
    expect(fake.calls).toEqual([])
  })

  it('un mensaje tuyo editado enseña ‹ 2/2 › y las flechas piden la otra versión', async () => {
    const mine: ChatMessage = {
      id: 'u9',
      projectId: 'p1',
      author: { type: 'user' },
      text: 'Hazlo en verde',
      createdAt: 9,
      versions: { current: 1, others: [{ at: 0, messages: [{ id: 'u0', projectId: 'p1', author: { type: 'user' }, text: 'Hazlo en azul', createdAt: 1 }], tasks: [] }] }
    }
    await show(mine)
    expect(host.textContent).toContain('2/2')
    expect(button('Versión siguiente').disabled).toBe(true)
    await act(async () => button('Versión anterior').click())
    expect(fake.calls).toEqual(['version:p1:u9:0'])
  })

  it('clic derecho en una respuesta: Responder, Bifurcar desde aquí y 👍 desde el menú', async () => {
    const done: ChatMessage = {
      id: 'w9',
      projectId: 'p1',
      runId: 'r1',
      author: { type: 'agent', agentId: 'codex' },
      text: 'Listo: ya valida el correo.',
      createdAt: 9,
      work: { taskId: 't9', title: 'Formulario', status: 'done', steps: [] }
    }
    await show(done)
    const open = () => act(async () => host.querySelector('article')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })))
    const item = (text: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((b) => b.textContent?.includes(text))
    await open()
    await act(async () => item('Responder a')!.click())
    expect(useComposer.getState().replyTo?.messageId).toBe('w9')
    await open()
    await act(async () => item('Me sirvió')!.click())
    expect(fake.calls).toContain('rate:p1:w9:up')
    useComposer.getState().clear()
  })

  it('un solo entregable se enseña tal cual', async () => {
    const one = [art('a9', 'artifacts/informe.png')]
    await show({ id: 'm3', projectId: 'p1', author: { type: 'agent', agentId: 'codex' }, text: 'Listo.', createdAt: 3, artifactIds: ['a9'] }, one)
    expect(host.textContent).toContain('informe.png')
    expect(host.querySelector('button[aria-expanded]')).toBeNull()
  })

  it('las imágenes adjuntas se ven en miniatura y, como los demás adjuntos, se abren en el panel de vista previa', async () => {
    useCowork.setState({ preview: null })
    await show({
      id: 'mu',
      projectId: 'p1',
      author: { type: 'user' },
      text: 'mira esto',
      createdAt: 1,
      attachments: [
        { id: 'f1', name: 'notas.md', relPath: 'attachments/notas.md', mime: 'text/markdown', size: 20 },
        { id: 'f2', name: 'captura.png', relPath: 'attachments/captura.png', mime: 'image/png', size: 300 }
      ]
    })
    const img = host.querySelector('img[alt="captura.png"]') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('cowork://file/p1/attachments/captura.png')
    await act(async () => button('Ver notas.md').click())
    const p = useCowork.getState().preview!
    // Primero las imágenes (como se ven) y luego el resto; se abre el pulsado.
    expect(p.items.map((x) => x.name)).toEqual(['captura.png', 'notas.md'])
    expect(p.index).toBe(1)
    expect(fake.calls).toEqual([])
    // Si la miniatura no carga, vuelve a ser una ficha con su nombre.
    await act(async () => img.dispatchEvent(new Event('error')))
    expect(host.querySelector('img[alt="captura.png"]')).toBeNull()
    expect(button('Ver captura.png')).toBeDefined()
  })

  it('un entregable se abre en el panel de vista previa, con los demás del mensaje para pasar de uno a otro', async () => {
    useCowork.setState({ preview: null })
    const two = [art('a1', 'artifacts/web/index.html'), art('a2', 'artifacts/web/logo.png')]
    await show({ id: 'm4', projectId: 'p1', author: { type: 'agent', agentId: 'codex' }, text: 'Listo.', createdAt: 3, artifactIds: ['a1', 'a2'] }, two)
    await act(async () => (host.querySelector('button[aria-expanded]') as HTMLButtonElement).click())
    await act(async () => button('Abrir logo.png').click())
    const p = useCowork.getState().preview!
    expect(p.items.map((x) => x.relPath)).toEqual(['artifacts/web/index.html', 'artifacts/web/logo.png'])
    expect(p.index).toBe(1)
    expect(p.items[1].artifactId).toBe('a2')
  })

  it('el archivo pedido sale suelto y delante; los de trabajo, plegados en «Archivos de trabajo»', async () => {
    const list = [art('j1', 'api/a.json'), art('j2', 'api/b.json'), art('s1', 'scripts/generar_pdf.py'), art('p1', 'reporte-ghl.pdf')]
    await show({ id: 'm5', projectId: 'p1', author: { type: 'agent', agentId: 'claude' }, text: 'Listo.', createdAt: 4, artifactIds: list.map((a) => a.id) }, list)
    // El PDF se puede abrir sin desplegar nada; los json no se ven hasta abrir la carpeta.
    expect(button('Abrir reporte-ghl.pdf')).toBeDefined()
    expect(host.textContent).toContain('Archivos de trabajo')
    expect(host.textContent).not.toContain('a.json')
    await act(async () => (host.querySelector('button[aria-expanded]') as HTMLButtonElement).click())
    expect(host.textContent).toContain('a.json')
  })
})

describe('nota de voz enviada al momento', () => {
  const voice = (over: Partial<ChatMessage>): ChatMessage => ({ id: 'v1', projectId: 'p1', author: { type: 'user' }, text: '', createdAt: Date.now(), voiceNote: 'transcribing', ...over })

  it('mientras se pasa a texto lo dice, y luego queda la marca con lo dicho', async () => {
    await show(voice({}))
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Nota de voz · pasándola a texto…')
    await show(voice({ text: 'revisa el informe', voiceNote: 'sent' }))
    expect(host.textContent).toContain('revisa el informe')
    expect(host.textContent).toContain('Nota de voz')
    expect(host.querySelector('[role="status"]')).toBeNull()
  })

  it('si falló, o kywai se cerró a medias, dice que no se pudo', async () => {
    await show(voice({ voiceNote: 'failed' }))
    expect(host.textContent).toContain('no se pudo pasar a texto')
    await show(voice({ createdAt: Date.now() - 60 * 60_000 }))
    expect(host.textContent).toContain('no se pudo pasar a texto')
  })
})
