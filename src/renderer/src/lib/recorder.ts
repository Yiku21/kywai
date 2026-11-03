// Grabación de notas de voz para el dictado: graba con MediaRecorder y entrega un WAV mono de 16 kHz
// (lo que mejor lee Whisper, sin depender de ffmpeg en el equipo).

/** Hay micrófono disponible: en el navegador exige HTTPS o localhost. */
export const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

export interface Recording {
  /** Termina y devuelve el audio en WAV. */
  stop(): Promise<Uint8Array>
  /** Descarta la grabación. */
  cancel(): void
  /** Nivel de entrada 0..1 (para animar el botón). */
  level(): number
}

const RATE = 16000

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  })
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  recorder.start(250)

  // Medidor de nivel para la animación.
  const ctx = new AudioContext()
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  ctx.createMediaStreamSource(stream).connect(analyser)
  const buf = new Uint8Array(analyser.fftSize)

  const release = () => {
    stream.getTracks().forEach((t) => t.stop())
    void ctx.close()
  }

  return {
    level() {
      analyser.getByteTimeDomainData(buf)
      let peak = 0
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
      return Math.min(1, peak / 64)
    },
    cancel() {
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
    stop() {
      return new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          release()
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
            resolve(await toWav16k(blob))
          } catch (e) {
            reject(e)
          }
        }
        recorder.stop()
      })
    }
  }
}

/** Decodifica el audio grabado, lo pasa a mono 16 kHz y lo empaqueta como WAV PCM de 16 bits. */
async function toWav16k(blob: Blob): Promise<Uint8Array> {
  const decodeCtx = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decodeCtx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void decodeCtx.close()
  }
  const frames = Math.max(1, Math.ceil(decoded.duration * RATE))
  const offline = new OfflineAudioContext(1, frames, RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  src.connect(offline.destination)
  src.start()
  const pcm = (await offline.startRendering()).getChannelData(0)

  const out = new ArrayBuffer(44 + pcm.length * 2)
  const v = new DataView(out)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + pcm.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, pcm.length * 2, true)
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]))
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true)
  }
  return new Uint8Array(out)
}
