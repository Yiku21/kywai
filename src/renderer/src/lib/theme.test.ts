import { beforeEach, describe, expect, it, vi } from 'vitest'

// La paleta del espacio 3D no hace falta para esto.
vi.mock('@/scene/palette', () => ({ setScenePalette: () => {} }))

/** Un dispositivo nuevo: almacenamiento vacío y el módulo cargado de cero. */
async function device() {
  localStorage.clear()
  vi.resetModules()
  const theme = await import('./theme')
  const sent: string[] = []
  theme.onThemeChosen((id) => sent.push(id))
  return { theme, sent }
}

describe('tema compartido por el servidor', () => {
  beforeEach(() => localStorage.clear())

  it('sigue el tema del servidor al conectar y cuando otro dispositivo lo cambia', async () => {
    const { theme } = await device()
    theme.followServerTheme('mundo-bosque')
    expect(document.documentElement.dataset.world).toBe('bosque')
    expect(theme.storedTheme()).toBe('mundo-bosque')
    theme.followServerTheme('grafito')
    expect(document.documentElement.dataset.theme).toBe('grafito')
    expect(theme.lastCityColor()).toBe('grafito')
    // Un id que esta versión no conoce no rompe nada.
    theme.followServerTheme('mundo-futuro')
    expect(theme.storedTheme()).toBe('grafito')
  })

  it('al elegir un tema se lo dice al servidor', async () => {
    const { theme, sent } = await device()
    theme.setTheme('mundo-matrix')
    expect(sent).toEqual(['mundo-matrix'])
  })

  it('con tema propio ni sigue ni cambia el del servidor, y al quitarlo vuelve al del servidor', async () => {
    const { theme, sent } = await device()
    theme.setOwnTheme(true)
    theme.setTheme('marfil')
    expect(sent).toEqual([])
    theme.followServerTheme('mundo-eva')
    expect(theme.storedTheme()).toBe('marfil')
    theme.setOwnTheme(false)
    expect(theme.ownTheme()).toBe(false)
    expect(theme.storedTheme()).toBe('mundo-eva')
    expect(sent).toEqual([])
  })

  it('si el servidor aún no tiene tema, al quitar el propio le pasa el de este dispositivo', async () => {
    const { theme, sent } = await device()
    theme.setOwnTheme(true)
    theme.setTheme('bosque')
    theme.setOwnTheme(false)
    expect(sent).toEqual(['bosque'])
  })
})
