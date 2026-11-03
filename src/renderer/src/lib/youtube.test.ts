import { describe, expect, it } from 'vitest'
import { parseStartSeconds, parseVideoId } from './youtube'

describe('enlaces de YouTube', () => {
  it('reconoce los formatos habituales', () => {
    const id = 'dQw4w9WgXcQ'
    for (const url of [
      `https://www.youtube.com/watch?v=${id}&list=RD`,
      `youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}?si=abc`,
      `https://m.youtube.com/watch?v=${id}`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube-nocookie.com/embed/${id}`,
      id
    ]) {
      expect(parseVideoId(url)).toBe(id)
    }
    expect(parseVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseVideoId('hola')).toBeNull()
  })

  it('lee el segundo de inicio', () => {
    expect(parseStartSeconds('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(90)
    expect(parseStartSeconds('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toBe(90)
    expect(parseStartSeconds('dQw4w9WgXcQ')).toBe(0)
  })
})
