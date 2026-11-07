package com.aicowork.remote.ui.orbita

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.aicowork.remote.i18n.t

/**
 * Dictado en directo con el reconocimiento de voz del propio móvil: el texto va saliendo mientras hablas.
 * Es la alternativa rápida a la nota de voz (que graba y la pasa a texto Whisper en el ordenador).
 * En las pruebas se sustituye por uno falso.
 */
interface LiveDictation {
    /** Si el móvil tiene un reconocedor de voz. */
    val available: Boolean

    /** Empieza a escuchar en [languageTag] (p. ej. «es-ES»). Lanza si no se puede. */
    fun start(languageTag: String, listener: Listener)

    /** Deja de escuchar: lo último que se oyó llega con [Listener.onFinal] y después [Listener.onEnd]. */
    fun stop()

    /** Deja de escuchar sin dar más resultados. */
    fun cancel()

    fun release()

    interface Listener {
        /** Volumen de la voz entre 0 y 1 (para el anillo del botón). */
        fun onLevel(level: Float)

        /** Lo que va entendiendo de la frase en curso (cambia mientras hablas). */
        fun onPartial(text: String)

        /** Una frase ya cerrada. */
        fun onFinal(text: String)

        /** Algo falló; [heardNothing]: no se llegó a entender nada en toda la sesión. */
        fun onError(error: DictationError, heardNothing: Boolean)

        /** Se terminó de escuchar (por [stop], por silencio largo o tras un fallo). */
        fun onEnd()
    }
}

enum class DictationError { NoSpeech, Network, Language, Permission, Busy, Other }

/** Mensaje para el usuario. [noteFallback]: hay nota de voz para cuando el dictado del móvil no sirve. */
fun DictationError.message(noteFallback: Boolean): String = when (this) {
    DictationError.NoSpeech -> t("No te he oído: toca el micrófono y habla")
    DictationError.Network ->
        if (noteFallback) t("El dictado del móvil necesita internet. Mantén pulsado el micrófono para grabar una nota de voz.")
        else t("El dictado del móvil necesita internet")
    DictationError.Language ->
        if (noteFallback) t("El dictado del móvil no tiene este idioma. Mantén pulsado el micrófono para grabar una nota de voz.")
        else t("El dictado del móvil no tiene este idioma")
    DictationError.Permission -> t("Sin permiso para el micrófono: actívalo en Ajustes › Aplicaciones › kywai › Permisos.")
    DictationError.Busy -> t("El micrófono lo está usando otra app")
    DictationError.Other -> t("No se pudo dictar")
}

/**
 * [LiveDictation] con el SpeechRecognizer de Android. Android corta tras una pausa; si no has tocado «parar»,
 * vuelve a escuchar solo y sigue añadiendo frases hasta que lo pares o calles un buen rato.
 * Todo se llama desde el hilo principal.
 */
class AndroidLiveDictation(private val context: Context) : LiveDictation {
    private var recognizer: SpeechRecognizer? = null
    private var listener: LiveDictation.Listener? = null
    private var language = "es-ES"
    private var stopping = false
    private var heardSomething = false
    private var lastPartial = ""

    override val available: Boolean
        get() = runCatching { SpeechRecognizer.isRecognitionAvailable(context) }.getOrDefault(false)

    override fun start(languageTag: String, listener: LiveDictation.Listener) {
        cancel()
        this.listener = listener
        language = languageTag
        stopping = false
        heardSomething = false
        val r = SpeechRecognizer.createSpeechRecognizer(context) ?: error(t("No se pudo dictar"))
        recognizer = r
        r.setRecognitionListener(callbacks)
        listen()
    }

    private fun listen() {
        lastPartial = ""
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            // Pausas más largas antes de dar la frase por terminada (no todos los móviles lo respetan).
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2_500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2_500L)
        }
        recognizer?.startListening(intent)
    }

    override fun stop() {
        if (recognizer == null) return
        stopping = true
        recognizer?.stopListening()
    }

    override fun cancel() {
        recognizer?.let {
            it.setRecognitionListener(null)
            it.cancel()
            it.destroy()
        }
        recognizer = null
        listener = null
    }

    override fun release() = cancel()

    private fun finish() {
        val l = listener
        cancel()
        l?.onEnd()
    }

    private val callbacks = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) = Unit
        override fun onBeginningOfSpeech() = Unit
        override fun onBufferReceived(buffer: ByteArray?) = Unit
        override fun onEvent(eventType: Int, params: Bundle?) = Unit
        override fun onEndOfSpeech() = Unit

        // De unos −2 dB (silencio) a unos 10 dB (voz alta).
        override fun onRmsChanged(rmsdB: Float) {
            listener?.onLevel(((rmsdB + 2f) / 12f).coerceIn(0f, 1f))
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val text = partialResults.firstResult() ?: return
            if (text.isNotBlank()) {
                lastPartial = text
                listener?.onPartial(text)
            }
        }

        override fun onResults(results: Bundle?) {
            val text = results.firstResult()?.takeIf { it.isNotBlank() } ?: lastPartial
            lastPartial = ""
            if (text.isNotBlank()) {
                heardSomething = true
                listener?.onFinal(text)
            }
            // Una pausa no es el final: sigue escuchando hasta que lo pares.
            if (stopping) finish() else listen()
        }

        override fun onError(error: Int) {
            // Lo que estaba a medias no se pierde.
            if (lastPartial.isNotBlank()) {
                heardSomething = true
                listener?.onFinal(lastPartial)
                lastPartial = ""
            }
            val kind = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> DictationError.NoSpeech
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> DictationError.Network
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> DictationError.Permission
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> DictationError.Busy
                12, 13 -> DictationError.Language // ERROR_LANGUAGE_NOT_SUPPORTED / ERROR_LANGUAGE_UNAVAILABLE (Android 12+)
                SpeechRecognizer.ERROR_CLIENT -> if (stopping) null else DictationError.Other
                else -> DictationError.Other
            }
            // Callarse un rato después de haber dictado algo es la forma normal de terminar: sin aviso.
            if (kind != null && !(kind == DictationError.NoSpeech && heardSomething)) listener?.onError(kind, !heardSomething)
            finish()
        }
    }

    private fun Bundle?.firstResult(): String? =
        this?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
}
