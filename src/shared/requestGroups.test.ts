import { describe, expect, it } from 'vitest'
import type { Artifact, ArtifactKind, Attachment, ChatMessage } from './types'
import { groupByRequest, requestTitle, LOOSE_ATTACHMENTS, ONLY_ATTACHMENTS, OTHER_FILES } from './requestGroups'

let n = 0
function art(relPath: string, kind: ArtifactKind, createdAt: number, taskId?: string): Artifact {
  const name = relPath.split('/').pop() ?? relPath
  return { id: `a${++n}`, projectId: 'p', taskId, agentId: 'claude', name, relPath, kind, size: 1, createdAt }
}
function att(name: string): Attachment {
  return { id: `f${++n}`, name, relPath: `adjuntos/${name}`, mime: 'image/png', size: 1 }
}
function said(text: string, runId: string, createdAt: number, attachments?: Attachment[]): ChatMessage {
  return { id: `m${++n}`, projectId: 'p', runId, author: { type: 'user' }, text, createdAt, attachments }
}

describe('Archivos por petición', () => {
  it('una petición repartida en varias tareas queda en una sola carpeta, con tus adjuntos', () => {
    const foto = att('captura.png')
    const groups = groupByRequest({
      messages: [said('Haz un vídeo de kywai\ncon tres escenas', 'r1', 100, [foto]), { ...said('', 'r1', 90), author: { type: 'agent', agentId: 'hermes' } }],
      tasks: { t1: { runId: 'r1', title: 'Guion' }, t2: { runId: 'r1', title: 'Montaje' } },
      artifacts: [art('video/guion.md', 'markdown', 110, 't1'), art('video/escena-1.png', 'image', 120, 't2'), art('video/final.mp4', 'other', 130, 't2')],
      attachments: [foto]
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Haz un vídeo de kywai')
    expect(groups[0].attachments.map((a) => a.name)).toEqual(['captura.png'])
    // El vídeo final delante; luego imagen y Markdown (mismo peso), lo más nuevo primero.
    expect(groups[0].generated.map((a) => a.name)).toEqual(['final.mp4', 'escena-1.png', 'guion.md'])
    expect(groups[0].newest).toBe(130)
  })

  it('las peticiones van de la más reciente a la más antigua y un «sí» al plan no abre otra', () => {
    const groups = groupByRequest({
      messages: [said('Primera', 'r1', 10), said('Segunda', 'r2', 20), said('sí', 'r2', 25)],
      tasks: { t1: { runId: 'r1', title: 'A' }, t2: { runId: 'r2', title: 'B' } },
      artifacts: [art('x/a.md', 'markdown', 30, 't1'), art('y/b.md', 'markdown', 40, 't2')],
      attachments: []
    })
    expect(groups.map((g) => g.title)).toEqual(['Segunda', 'Primera'])
  })

  it('sin tu mensaje usa el título de la tarea; sin tarea, la carpeta del disco', () => {
    const groups = groupByRequest({
      messages: [],
      tasks: { t1: { runId: 'r9', title: 'Logo nuevo' } },
      artifacts: [art('marca/logo.svg', 'image', 5, 't1'), art('informes/mes.pdf', 'other', 4), art('artifacts/x.txt', 'text', 3)],
      attachments: []
    })
    expect(groups.map((g) => g.title)).toEqual(['Logo nuevo', 'informes', OTHER_FILES])
  })

  it('adjuntos sin mensaje van al final y un mensaje solo con adjuntos tiene título', () => {
    const suelto = att('suelto.pdf')
    const foto = att('foto.png')
    const groups = groupByRequest({ messages: [said('  ', 'r1', 50, [foto])], tasks: {}, artifacts: [art('a/b.md', 'markdown', 10)], attachments: [foto, suelto] })
    expect(groups.map((g) => g.title)).toEqual([ONLY_ATTACHMENTS, 'a', LOOSE_ATTACHMENTS])
    expect(groups[2].attachments.map((a) => a.name)).toEqual(['suelto.pdf'])
  })

  it('el título es la primera línea con texto, recortada', () => {
    expect(requestTitle('\n  hola  \nadiós')).toBe('hola')
    expect(requestTitle('x'.repeat(100), 10)).toBe(`${'x'.repeat(9)}…`)
  })
})
