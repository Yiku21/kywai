// «Novedades»: qué cambios se enseñan después de actualizar.
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '/tmp', getVersion: () => '0.1.0' } }))
vi.mock('./updater', () => ({ isReleaseBuild: () => false }))
vi.mock('./selfUpdate', () => ({ sourceDir: () => null }))

const { cleanSubjects } = await import('./whatsNew')

describe('novedades', () => {
  it('usa solo el título y quita lo que no le dice nada a quien usa la app', () => {
    expect(
      cleanSubjects([
        'Vídeo: varios vídeos con un solo /video\n\nDetalle técnico que no sale.',
        'Órbita 1.313 publicada automáticamente desde GitHub con la clave de siempre',
        "Merge pull request #3 from Yiku21/rama",
        'Mac: versión de prueba para comprobar que la actualización dentro de la app funciona',
        'El TikTok de kywai: «/tiktok» sube vídeos como borrador o los publica directo',
        'Vídeo: varios vídeos con un solo /video',
        ''
      ])
    ).toEqual(['Vídeo: varios vídeos con un solo /video', 'El TikTok de kywai: «/tiktok» sube vídeos como borrador o los publica directo'])
  })
})
