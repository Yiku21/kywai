// Qué habilidades, plugins y servidores MCP son «de vídeo»: kywai los lleva a la carpeta del estudio de vídeo
// (habilidades/video) y se los da al agente que escribe el guion de cada vídeo, no al resto de tareas.

const VIDEO_RE = /(v[ií]deos?\b|hyperframes|remotion|ffmpeg|text[- ]to[- ]speech|\btts\b|voice[- ]?overs?|subt[ií]tulos|motion graphics|video[- ]?edit)/i

export function isVideoExtension(...texts: (string | undefined | null)[]): boolean {
  return VIDEO_RE.test(texts.filter(Boolean).join(' '))
}

/** Subcarpeta de «habilidades» con las de vídeo (no es una habilidad: no tiene SKILL.md). */
export const VIDEO_SKILLS_FOLDER = 'video'
