import { afterEach, describe, expect, it } from 'vitest'
import { signInYoutube, signOutYoutube, youtubeHost } from './youtubeAccount'
import { embedUrl } from './ytEmbed'

const w = window as unknown as { cowork?: unknown }

describe('tu cuenta de YouTube en la música', () => {
  afterEach(async () => {
    delete w.cowork
    await signOutYoutube()
  })

  it('sin cuenta el reproductor carga de youtube-nocookie', () => {
    expect(youtubeHost()).toBe('https://www.youtube-nocookie.com')
    expect(embedUrl(1, { videoId: 'dQw4w9WgXcQ' }, null)).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/)
  })

  it('en el navegador usa la sesión que ya tenga y carga de youtube.com', async () => {
    expect(await signInYoutube()).toBe(true)
    expect(youtubeHost()).toBe('https://www.youtube.com')
    expect(embedUrl(1, { videoId: 'dQw4w9WgXcQ' }, 'https://mac.local')).toMatch(/^https:\/\/www\.youtube\.com\/embed\//)
    expect(localStorage.getItem('kywai.youtube.cuenta.v1')).toBe('1')
  })

  it('en la app solo la usa si Google dejó la sesión iniciada', async () => {
    let signedOut = false
    w.cowork = {
      youtubeSignIn: async () => false,
      youtubeSignOut: async () => {
        signedOut = true
      }
    }
    expect(await signInYoutube()).toBe(false)
    expect(youtubeHost()).toBe('https://www.youtube-nocookie.com')
    w.cowork = { youtubeSignIn: async () => true, youtubeSignOut: async () => void (signedOut = true) }
    expect(await signInYoutube()).toBe(true)
    await signOutYoutube()
    expect(signedOut).toBe(true)
    expect(youtubeHost()).toBe('https://www.youtube-nocookie.com')
  })
})
