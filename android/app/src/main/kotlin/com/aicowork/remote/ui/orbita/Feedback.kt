package com.aicowork.remote.ui.orbita

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.staticCompositionLocalOf
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.min
import kotlin.math.sin

/** Sonidos cortos de kywai (los mismos tonos que el escritorio). */
enum class Sfx(val priority: Int) { Click(0), Message(1), Transfer(2), FileCreated(2), TaskStart(3), ProjectCreated(3), TaskComplete(4), Error(5) }

/**
 * Sonidos sintetizados como en el escritorio (`src/renderer/src/lib/audio.ts`): ondas seno/triángulo con
 * deslizamiento exponencial y envolvente corta. Se generan una vez en un hilo aparte y se reproducen con
 * AudioTrack estático (sin archivos de audio). Los de menos prioridad se descartan si acaba de sonar otro.
 */
class UiSounds {
    private val executor = Executors.newSingleThreadExecutor { Thread(it, "ui-sounds").apply { isDaemon = true } }
    private val tracks = HashMap<Sfx, AudioTrack>()
    private var lastAt = 0L
    private var lastPriority = -1
    private val lastBySound = HashMap<Sfx, Long>()

    fun play(sfx: Sfx) {
        executor.execute {
            val now = System.currentTimeMillis()
            // Como el escritorio: no se pisan; uno más importante sí puede sonar enseguida.
            if (now - (lastBySound[sfx] ?: 0) < 350) return@execute
            if (now - lastAt < 300 && sfx.priority <= lastPriority) return@execute
            val track = runCatching { tracks.getOrPut(sfx) { build(sfx) } }.getOrNull() ?: return@execute
            runCatching {
                if (track.playState == AudioTrack.PLAYSTATE_PLAYING) track.stop()
                track.reloadStaticData()
                track.play()
            }
            lastAt = now
            lastPriority = sfx.priority
            lastBySound[sfx] = now
        }
    }

    fun release() {
        executor.execute {
            tracks.values.forEach { runCatching { it.release() } }
            tracks.clear()
        }
    }

    private class Note(val freq: Double, val delay: Double, val length: Double, val volume: Double = 0.15, val triangle: Boolean = false, val end: Double = freq)

    private fun notes(sfx: Sfx): List<Note> = when (sfx) {
        Sfx.TaskStart -> listOf(Note(220.0, 0.0, 0.16, 0.13, triangle = true, end = 330.0), Note(440.0, 0.12, 0.2))
        Sfx.TaskComplete -> listOf(523.25, 659.25, 783.99).mapIndexed { i, f -> Note(f, i * 0.12, 0.36) }
        Sfx.Error -> listOf(Note(196.0, 0.0, 0.48, 0.19, end = 110.0), Note(146.83, 0.14, 0.36, 0.08, triangle = true, end = 98.0))
        Sfx.Message -> listOf(Note(659.25, 0.0, 0.17, 0.12), Note(523.25, 0.13, 0.25, 0.12))
        Sfx.Transfer -> listOf(Note(293.66, 0.0, 0.24, 0.13, end = 587.33), Note(587.33, 0.23, 0.25, 0.12, end = 392.0))
        Sfx.FileCreated -> listOf(Note(783.99, 0.0, 0.09, 0.1, triangle = true), Note(1046.5, 0.11, 0.2, 0.09))
        Sfx.ProjectCreated -> listOf(261.63, 329.63, 392.0, 523.25).mapIndexed { i, f -> Note(f, i * 0.055, 0.58, 0.09) }
        Sfx.Click -> listOf(Note(440.0, 0.0, 0.035, 0.07, end = 320.0))
    }

    private fun build(sfx: Sfx): AudioTrack {
        val rate = 44_100
        val list = notes(sfx)
        val total = list.maxOf { it.delay + it.length } + 0.05
        val samples = DoubleArray((total * rate).toInt())
        for (n in list) {
            val start = (n.delay * rate).toInt()
            val count = (n.length * rate).toInt()
            val attack = min(0.018, n.length / 4)
            var phase = 0.0
            for (i in 0 until count) {
                val t = i.toDouble() / rate
                // Frecuencia con deslizamiento exponencial (exponentialRampToValueAtTime).
                val f = n.freq * exp(ln(n.end / n.freq) * (t / n.length))
                phase += 2 * PI * f / rate
                val wave = if (n.triangle) (2 / PI) * asin(sin(phase)) else sin(phase)
                val env = if (t < attack) n.volume * t / attack
                else n.volume * exp(ln(0.0001 / n.volume) * ((t - attack) / (n.length - attack)))
                val k = start + i
                if (k < samples.size) samples[k] += wave * env
            }
        }
        val peak = samples.maxOf { abs(it) }.coerceAtLeast(1e-6)
        val gain = if (peak > 0.95) 0.95 / peak else 1.0
        val pcm = ShortArray(samples.size) { (samples[it] * gain * 0.9 * Short.MAX_VALUE).toInt().toShort() }
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setTransferMode(AudioTrack.MODE_STATIC)
            .setBufferSizeInBytes(pcm.size * 2)
            .build()
        track.write(pcm, 0, pcm.size)
        return track
    }
}

/**
 * Respuesta al tacto: vibración breve (según la preferencia y la del sistema) y sonidos opcionales. La respuesta
 * visual va siempre en los propios controles; esto la complementa sin repetirse en cada toque.
 */
class Feedback(private val sounds: UiSounds?) {
    @Volatile var haptics = true
    @Volatile var sound = true
    var view: View? = null

    private fun vibrate(constant: Int) {
        if (!haptics) return
        view?.performHapticFeedback(constant)
    }

    /** Toque en un control normal (cambiar de sección, abrir algo). */
    fun tap() = vibrate(if (Build.VERSION.SDK_INT >= 34) HapticFeedbackConstants.SEGMENT_TICK else HapticFeedbackConstants.CLOCK_TICK)

    /** Elegir algo en el mundo o en una lista. */
    fun select() = vibrate(HapticFeedbackConstants.CLOCK_TICK)

    /** Confirmación (enviar, confirmar un recuerdo, crear una tarea). */
    fun confirm() = vibrate(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)

    /** Algo falló o se rechazó. */
    fun reject() = vibrate(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS)

    fun play(sfx: Sfx) {
        if (sound) sounds?.play(sfx)
    }
}

val LocalFeedback = staticCompositionLocalOf { Feedback(null) }
