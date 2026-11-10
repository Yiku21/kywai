import { describe, expect, it } from 'vitest'
import type { Artifact, ArtifactKind } from './types'
import { groupResults, resultWeight, splitMain } from './resultGroups'

let n = 0
function art(relPath: string, kind: ArtifactKind, createdAt: number, taskId?: string): Artifact {
  const name = relPath.split('/').pop() ?? relPath
  return { id: `a${++n}`, projectId: 'p', taskId, agentId: 'claude', name, relPath, kind, size: 1, createdAt }
}

describe('Resultados agrupados en carpetas', () => {
  it('el vídeo manda; escenas, voces y json quedan como archivos de trabajo', () => {
    const list = [
      art('video/nino/escena-2.png', 'image', 10, 't1'),
      art('video/nino/escena-10.png', 'image', 11, 't1'),
      art('video/nino/escena-1.png', 'image', 12, 't1'),
      art('video/nino/voz-1.wav', 'other', 13, 't1'),
      art('video/nino/guion.json', 'code', 14, 't1'),
      art('video/nino/el-nino.mp4', 'other', 20, 't1')
    ]
    const { main, work } = splitMain(list)
    expect(main.map((a) => a.name)).toEqual(['el-nino.mp4'])
    // Por nombre y con números en orden natural (escena-2 antes que escena-10).
    expect(work.map((a) => a.name)).toEqual(['escena-1.png', 'escena-2.png', 'escena-10.png', 'guion.json', 'voz-1.wav'])
  })

  it('sin vídeo ni página, las imágenes son el resultado', () => {
    const { main, work } = splitMain([art('a/logo.png', 'image', 1), art('a/notas.txt', 'text', 2), art('a/b.png', 'image', 3)])
    expect(main.map((a) => a.name)).toEqual(['b.png', 'logo.png'])
    expect(work.map((a) => a.name)).toEqual(['notas.txt'])
  })

  it('si todo es código, no esconde nada', () => {
    const { main, work } = splitMain([art('s/b.ts', 'code', 1), art('s/a.ts', 'code', 2)])
    expect(main.map((a) => a.name)).toEqual(['a.ts', 'b.ts'])
    expect(work).toEqual([])
  })

  it('pesos de cada tipo', () => {
    expect(resultWeight({ name: 'x.MP4', relPath: 'x.MP4', kind: 'other' })).toBe(3)
    expect(resultWeight({ name: 'index.html', relPath: 'index.html', kind: 'html' })).toBe(2)
    expect(resultWeight({ name: 'informe.pdf', relPath: 'informe.pdf', kind: 'other' })).toBe(2)
    expect(resultWeight({ name: 'SKILL.md', relPath: 'SKILL.md', kind: 'markdown' })).toBe(1)
    expect(resultWeight({ name: 'mezcla.wav', relPath: 'mezcla.wav', kind: 'other' })).toBe(1)
    expect(resultWeight({ name: 'package.json', relPath: 'package.json', kind: 'code' })).toBe(0)
  })

  it('una carpeta por tarea con su título; lo demás, por carpeta del disco; la más reciente primero', () => {
    const groups = groupResults(
      [
        art('video/nino/escena-1.png', 'image', 10, 't1'),
        art('video/nino/nino.mp4', 'other', 30, 't1'),
        art('informes/q3/informe.pdf', 'other', 40),
        art('artifacts/suelto.md', 'markdown', 5),
        art('otra/cosa.png', 'image', 50, 'vieja')
      ],
      (id) => (id === 't1' ? 'Vídeo: el niño que casi volaba' : undefined)
    )
    expect(groups.map((g) => [g.key, g.title, g.main.length + g.work.length])).toEqual([
      ['task:vieja', 'otra', 1],
      ['dir:informes/q3', 'q3', 1],
      ['task:t1', 'Vídeo: el niño que casi volaba', 2],
      ['dir:artifacts', 'Otros archivos', 1]
    ])
    expect(groups[2].newest).toBe(30)
    expect(groups[2].main[0].name).toBe('nino.mp4')
  })
})
