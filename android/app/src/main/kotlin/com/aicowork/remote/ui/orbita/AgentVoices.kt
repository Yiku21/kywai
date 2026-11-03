package com.aicowork.remote.ui.orbita

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/** Forma de onda de una voz (como los osciladores del escritorio). */
enum class Wave { Sine, Triangle, Square, Sawtooth }

/** Timbre de un agente: tono base (Hz), onda, sílabas por segundo, volumen y cuánto sube o baja cada sílaba. */
data class VoiceProfile(val base: Double, val wave: Wave, val rate: Double, val level: Double, val glide: Double)

/**
 * Las voces de los agentes, igual que en el escritorio (`VOICES` en src/renderer/src/lib/audio.ts): un balbuceo
 * corto, una sílaba por letra (como los aldeanos de Animal Crossing), con el timbre de cada proveedor. Se genera por
 * código, sin archivos de audio.
 */
object Voices {
    const val SAMPLE_RATE = 22_050
    /** Letras que suenan como mucho de una vez (un mensaje entero o una frase). */
    const val MAX_SYLLABLES = 28
    /** Notas (semitonos sobre el tono base) que recorren las letras: pentatónica, nunca desafina. */
    private val SCALE = intArrayOf(0, 2, 4, 7, 9, 12)

    private val BY_PROVIDER = mapOf(
        "hermes" to VoiceProfile(392.0, Wave.Triangle, 17.0, 0.10, 1.06), // mensajero: claro y ligero
        "claude" to VoiceProfile(311.0, Wave.Sine, 13.0, 0.13, 1.03), // cálido y pausado
        "codex" to VoiceProfile(196.0, Wave.Square, 19.0, 0.04, 1.0), // robótico y rápido
        "gemini" to VoiceProfile(494.0, Wave.Sine, 15.0, 0.12, 1.12), // brillante, sube al final
        "muse" to VoiceProfile(659.0, Wave.Triangle, 16.0, 0.09, 1.18), // burbujeante y agudo
        "qwen" to VoiceProfile(247.0, Wave.Sawtooth, 11.0, 0.035, 0.95), // grave y lento
        "ollama" to VoiceProfile(233.0, Wave.Sawtooth, 11.0, 0.035, 0.95),
        "lmstudio" to VoiceProfile(262.0, Wave.Sawtooth, 11.0, 0.035, 0.95),
    )

    /** Mismo hash que el escritorio (FNV-1a): un proveedor desconocido recibe siempre la misma voz. */
    private fun hash(text: String): Long {
        var h = 2166136261L
        for (c in text) h = ((h xor c.code.toLong()) * 16777619L) and 0xFFFFFFFFL
        return h
    }

    /** La voz de un agente: la de su proveedor; el becario habla como su jefe, una quinta más agudo y más deprisa. */
    fun profile(provider: String, becario: Boolean = false): VoiceProfile {
        val h = hash(provider)
        val p = BY_PROVIDER[provider] ?: VoiceProfile(
            base = 262.0 + h % 300,
            wave = listOf(Wave.Sine, Wave.Triangle, Wave.Triangle)[(h % 3).toInt()],
            rate = 12.0 + h % 6,
            level = 0.1,
            glide = 1 + ((h shr 4) % 10) / 100.0,
        )
        return if (becario) p.copy(base = p.base * 1.5, rate = p.rate * 1.2) else p
    }

    /** Lo que se pronuncia: sin bloques de código, enlaces ni direcciones. */
    fun spoken(text: String): String = text
        .replace(Regex("```[\\s\\S]*?```"), " ")
        .replace(Regex("`[^`]*`"), " ")
        .replace(Regex("\\[([^\\]]*)]\\([^)]*\\)"), "$1")
        .replace(Regex("https?://\\S+"), " ")

    /**
     * El balbuceo de [text] en PCM de 16 bits a [SAMPLE_RATE]: una sílaba por letra o cifra (las vocales duran algo
     * más), un hueco corto en cada espacio y uno largo en cada signo de puntuación. null si no hay nada que decir.
     */
    fun render(profile: VoiceProfile, text: String, error: Boolean = false, maxSyllables: Int = MAX_SYLLABLES): ShortArray? {
        val step = 1 / profile.rate
        val tone = if (error) 0.8 else 1.0
        class Syllable(val at: Double, val freq: Double, val length: Double, val volume: Double)
        val syllables = ArrayList<Syllable>()
        var at = 0.01
        for (ch in spoken(text).take(600)) {
            if (syllables.size >= maxSyllables) break
            if (ch.isWhitespace()) { at += step * 0.5; continue }
            if (ch in ".,;:!?…") { at += step * (if (ch == ',') 1.0 else 1.8); continue }
            if (!ch.isLetterOrDigit()) continue
            val lower = ch.lowercaseChar()
            val code = lower.code
            val vowel = lower in "aeiouáéíóúü"
            val semitone = SCALE[code % SCALE.size]
            val jitter = 1 + (((code * 7919 + syllables.size * 104729) % 100) - 50) / 3000.0
            val freq = profile.base * 2.0.pow(semitone / 12.0) * jitter * tone
            syllables += Syllable(at, freq, (if (vowel) 0.9 else 0.6) * step, profile.level * (if (vowel) 1.0 else 0.8))
            at += step
        }
        if (syllables.isEmpty()) return null
        val total = syllables.last().let { it.at + it.length } + 0.03
        val out = ShortArray((total * SAMPLE_RATE).toInt())
        for (s in syllables) {
            val start = (s.at * SAMPLE_RATE).toInt()
            val count = (s.length * SAMPLE_RATE).toInt()
            val attack = min(0.018, s.length / 4)
            val end = s.freq * profile.glide
            var phase = 0.0
            for (i in 0 until count) {
                val t = i.toDouble() / SAMPLE_RATE
                val f = s.freq * exp(ln(end / s.freq) * (t / s.length))
                phase += 2 * PI * f / SAMPLE_RATE
                val wave = when (profile.wave) {
                    Wave.Sine -> sin(phase)
                    Wave.Triangle -> (2 / PI) * asin(sin(phase))
                    Wave.Square -> if (sin(phase) >= 0) 1.0 else -1.0
                    Wave.Sawtooth -> { val c = phase / (2 * PI); 2 * (c - floor(c + 0.5)) }
                }
                val env = if (t < attack) s.volume * t / attack else s.volume * exp(ln(0.0001 / s.volume) * ((t - attack) / (s.length - attack)))
                val k = start + i
                // Mismo refuerzo que el canal de voces del escritorio.
                if (k < out.size) out[k] = (wave * env * VOICE_BUS * Short.MAX_VALUE).toInt().coerceIn(-32767, 32767).toShort()
            }
        }
        return out
    }

    private const val VOICE_BUS = 1.4

    /** Más deprisa cuando la voz ya calló, y lo que queda sale como mucho en este tiempo. */
    private const val FAST_MS = 7.0
    private const val REST_MAX_MS = 1500.0

    /**
     * Cuándo aparece cada carácter de [text] (ms desde que empieza su voz), con los tiempos de [render]: una letra
     * por sílaba mientras balbucea; a partir de [spoken] sílabas, el resto sale deprisa. Igual que el escritorio.
     */
    fun revealTimes(text: String, rate: Double, spoken: Int = MAX_SYLLABLES): DoubleArray {
        val step = 1000 / rate
        val times = DoubleArray(text.length)
        var t = 10.0
        var syllables = 0
        var rest = -1
        for ((i, ch) in text.withIndex()) {
            times[i] = t
            if (syllables >= spoken) {
                if (rest < 0) rest = i
                t += FAST_MS
                continue
            }
            when {
                ch.isLowSurrogate() -> Unit
                ch.isWhitespace() -> t += step * 0.5
                ch in ".,;:!?…" -> t += step * (if (ch == ',') 1.0 else 1.8)
                ch.isLetterOrDigit() -> { t += step; syllables++ }
            }
        }
        if (rest >= 0 && times.isNotEmpty()) {
            val from = times[rest]
            val span = times.last() - from
            if (span > REST_MAX_MS) for (i in rest until times.size) times[i] = from + (times[i] - from) * REST_MAX_MS / span
        }
        return times
    }
}

/** Texto que se escribe al ritmo de la voz: desde [start] (SystemClock.uptimeMillis) aparece cada carácter a su tiempo. */
class Reveal(val text: String, val start: Long, private val times: DoubleArray) {
    fun visibleAt(now: Long): Int {
        val elapsed = now - start
        var n = 0
        while (n < times.size && times[n] <= elapsed) n++
        return n
    }
}

/**
 * Reproduce las voces en un hilo aparte: las de un mismo agente se encadenan (no se pisan) y, si ya tiene casi un
 * segundo pendiente, lo nuevo no se acumula. Las de agentes distintos pueden sonar a la vez.
 */
class AgentVoices {
    private val thread = HandlerThread("agent-voices").apply { start() }
    private val handler = Handler(thread.looper)
    private val busyUntil = HashMap<String, Long>()
    private val playing = HashSet<AudioTrack>()
    /** Volumen de las voces (0–1), aparte de los sonidos. */
    @Volatile var volume = 0.7f

    /**
     * Habla [text] con la voz del agente y devuelve cuándo empieza (SystemClock.uptimeMillis), para escribir el texto a
     * la vez; null si no va a sonar (sin nada que decir o con demasiado pendiente).
     */
    fun speak(agentId: String, profile: VoiceProfile, text: String, error: Boolean = false): Long? {
        val pcm = Voices.render(profile, text, error) ?: return null
        val now = SystemClock.uptimeMillis()
        val start = synchronized(busyUntil) {
            val busy = busyUntil[agentId] ?: 0L
            if (busy - now > MAX_BACKLOG_MS) return null
            max(now + 10, busy).also { busyUntil[agentId] = it + pcm.size * 1000L / Voices.SAMPLE_RATE }
        }
        handler.postAtTime({ play(pcm) }, start)
        return start
    }

    private fun play(pcm: ShortArray) {
        val v = volume
        if (v <= 0f) return
        val track = runCatching {
            AudioTrack.Builder()
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(Voices.SAMPLE_RATE).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                .setTransferMode(AudioTrack.MODE_STATIC)
                .setBufferSizeInBytes(pcm.size * 2)
                .build()
        }.getOrNull() ?: return
        runCatching {
            track.write(pcm, 0, pcm.size)
            track.setVolume(v)
            track.play()
            playing += track
        }.onFailure { track.release(); return }
        handler.postDelayed({ playing -= track; runCatching { track.release() } }, pcm.size * 1000L / Voices.SAMPLE_RATE + 200)
    }

    /** Calla lo que esté sonando (al silenciar las voces o los sonidos). */
    fun stop() {
        handler.post {
            handler.removeCallbacksAndMessages(null)
            playing.forEach { runCatching { it.stop(); it.release() } }
            playing.clear()
            synchronized(busyUntil) { busyUntil.clear() }
        }
    }

    fun release() {
        stop()
        thread.quitSafely()
    }

    private companion object {
        const val MAX_BACKLOG_MS = 900L
    }
}
