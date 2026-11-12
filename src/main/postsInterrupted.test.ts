import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => tmpdir(), getPath: () => tmpdir() } }))

import { POST_INTERRUPTED, getProject, initProjects } from './projects'

describe('publicaciones cortadas al cerrar kywai', () => {
  it('al abrir el proyecto pasan a «fallida» para poder reintentarlas', () => {
    const root = mkdtempSync(join(tmpdir(), 'posts-'))
    initProjects(root)
    const dir = join(root, 'projects', 'p1')
    mkdirSync(dir, { recursive: true })
    const author = { type: 'agent', id: 'a' }
    writeFileSync(
      join(dir, 'project.json'),
      JSON.stringify({
        project: { id: 'p1', name: 'P' },
        messages: [
          { id: 'm1', author, text: '', createdAt: 1, instagramPost: { video: 'v.mp4', caption: 'x', status: 'publishing' } },
          { id: 'm2', author, text: '', createdAt: 2, tiktokPost: { video: 'v.mp4', caption: 'x', status: 'sending' } },
          { id: 'm3', author, text: '', createdAt: 3, instagramPost: { video: 'v.mp4', caption: 'x', status: 'published' } }
        ]
      })
    )
    const [ig, tt, done] = getProject('p1').messages
    expect(ig.instagramPost).toMatchObject({ status: 'failed', error: POST_INTERRUPTED })
    expect(tt.tiktokPost).toMatchObject({ status: 'failed', error: POST_INTERRUPTED })
    expect(done.instagramPost?.status).toBe('published')
  })
})
