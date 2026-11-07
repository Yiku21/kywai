package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import java.io.File
import java.io.RandomAccessFile
import kotlin.math.sqrt

/**
 * Graba una nota de voz como WAV de 16 kHz, mono y 16 bits (lo que mejor entiende el dictado del ordenador, igual
 * que la nota del escritorio). Avisa del nivel para dibujar la onda. Para como mucho a los [maxMillis].
 */
class VoiceRecorder(private val file: File, private val maxMillis: Long = 5 * 60_000L) {
    @Volatile var level: Float = 0f
        private set
    @Volatile var elapsedMillis: Long = 0
        private set
    @Volatile private var running = false
    private var thread: Thread? = null
    private var failure: Throwable? = null

    /** Empieza a grabar (requiere el permiso RECORD_AUDIO concedido). Lanza si el micrófono no está disponible. */
    @SuppressLint("MissingPermission")
    fun start(onLimit: () -> Unit) {
        val min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (min <= 0) throw IllegalStateException(t("El micrófono no está disponible"))
        val record = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, min * 4)
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            throw IllegalStateException(t("No se pudo abrir el micrófono"))
        }
        file.parentFile?.mkdirs()
        val out = RandomAccessFile(file, "rw").apply { setLength(0); write(ByteArray(44)) }
        running = true
        record.startRecording()
        thread = Thread({
            val buffer = ShortArray(RATE / 20)
            val bytes = ByteArray(buffer.size * 2)
            var total = 0L
            try {
                while (running) {
                    val n = record.read(buffer, 0, buffer.size)
                    if (n <= 0) continue
                    var sum = 0.0
                    for (i in 0 until n) {
                        val s = buffer[i].toInt()
                        sum += (s * s).toDouble()
                        bytes[i * 2] = (s and 0xff).toByte()
                        bytes[i * 2 + 1] = (s shr 8 and 0xff).toByte()
                    }
                    out.write(bytes, 0, n * 2)
                    total += n * 2
                    // Nivel percibido 0..1 (raíz de la energía, con un poco de ganancia para la voz normal).
                    level = (sqrt(sum / n) / 6000.0).coerceIn(0.0, 1.0).toFloat()
                    elapsedMillis = total * 1000 / (RATE * 2)
                    if (elapsedMillis >= maxMillis) {
                        running = false
                        onLimit()
                    }
                }
            } catch (e: Throwable) {
                failure = e
            } finally {
                runCatching { record.stop() }
                record.release()
                writeHeader(out, total)
                out.close()
            }
        }, "nota-de-voz").apply { start() }
    }

    /** Termina y devuelve el archivo WAV (o lanza si la grabación falló o quedó vacía). */
    fun stop(): File {
        running = false
        thread?.join(2_000)
        failure?.let { throw it }
        if (elapsedMillis < 300) throw IllegalStateException(t("La nota es demasiado corta"))
        return file
    }

    fun cancel() {
        running = false
        thread?.join(2_000)
        file.delete()
    }

    private fun writeHeader(out: RandomAccessFile, dataBytes: Long) {
        fun le32(v: Long) = byteArrayOf((v and 0xff).toByte(), (v shr 8 and 0xff).toByte(), (v shr 16 and 0xff).toByte(), (v shr 24 and 0xff).toByte())
        fun le16(v: Int) = byteArrayOf((v and 0xff).toByte(), (v shr 8 and 0xff).toByte())
        out.seek(0)
        out.write("RIFF".toByteArray()); out.write(le32(36 + dataBytes)); out.write("WAVE".toByteArray())
        out.write("fmt ".toByteArray()); out.write(le32(16)); out.write(le16(1)); out.write(le16(1))
        out.write(le32(RATE.toLong())); out.write(le32(RATE * 2L)); out.write(le16(2)); out.write(le16(16))
        out.write("data".toByteArray()); out.write(le32(dataBytes))
    }

    companion object {
        const val RATE = 16_000
    }
}
