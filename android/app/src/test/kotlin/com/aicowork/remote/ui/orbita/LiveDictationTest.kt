package com.aicowork.remote.ui.orbita

import android.Manifest
import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.text.input.TextFieldValue
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Dictado en directo en el chat: el texto sale en la caja mientras hablas, con el reconocimiento de voz del móvil. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LiveDictationTest {
    @get:Rule
    val compose = createComposeRule()

    private class FakeDictation(override val available: Boolean = true) : LiveDictation {
        var listener: LiveDictation.Listener? = null
        var language: String? = null
        var stops = 0
        var cancels = 0
        override fun start(languageTag: String, listener: LiveDictation.Listener) {
            language = languageTag
            this.listener = listener
        }
        override fun stop() {
            stops++
        }
        override fun cancel() {
            cancels++
            listener = null
        }
        override fun release() = Unit
    }

    @Before
    fun grantMic() {
        shadowOf(ApplicationProvider.getApplicationContext<Application>()).grantPermissions(Manifest.permission.RECORD_AUDIO)
    }

    @Test
    fun tappingTheMicDictatesIntoTheChatBoxWhileYouSpeak() {
        val dictation = FakeDictation()
        val model = orbitaModelForTests(FakeController(SampleData.state()), liveDictation = dictation)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        model.chatDraft = TextFieldValue("Revisa")

        // Aunque el ordenador no tenga notas de voz, el micrófono sale: dicta el móvil.
        compose.onNodeWithTag("mic").assertIsDisplayed().performClick()
        compose.waitForIdle()
        assertEquals("es-ES", dictation.language)
        assertTrue(model.dictation != null)

        dictation.listener!!.onPartial("el pull")
        assertEquals("Revisa el pull", model.chatDraft.text)
        dictation.listener!!.onFinal("el pull request")
        dictation.listener!!.onPartial("de ayer")
        assertEquals("Revisa el pull request de ayer", model.chatDraft.text)

        compose.onNodeWithContentDescription("Dejar de dictar").assertIsDisplayed().performClick()
        assertEquals(1, dictation.stops)
        dictation.listener!!.onFinal("de ayer")
        dictation.listener!!.onEnd()
        assertNull(model.dictation)
        // El texto se queda en la caja para revisarlo: no se envía solo.
        assertEquals("Revisa el pull request de ayer", model.chatDraft.text)
    }

    @Test
    fun withoutSpeechRecognitionOrVoiceNotesThereIsNoMic() {
        val model = orbitaModelForTests(FakeController(SampleData.state()), liveDictation = FakeDictation(available = false))
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        assertEquals(0, compose.onAllNodes(androidx.compose.ui.test.hasTestTag("mic")).fetchSemanticsNodes().size)
    }

    @Test
    fun typingOrSendingStopsTheDictationWithoutLosingText() {
        val dictation = FakeDictation()
        val model = orbitaModelForTests(FakeController(SampleData.state()), liveDictation = dictation)
        model.startDictation(VoiceTarget.Chat, noteFallback = false)
        dictation.listener!!.onPartial("hola equipo")
        assertEquals("hola equipo", model.chatDraft.text)

        // Escribir a mano corta el dictado y no pisa lo escrito.
        val listener = dictation.listener!!
        model.editDraft(VoiceTarget.Chat, TextFieldValue("hola equipo, ¿qué tal?"))
        assertNull(model.dictation)
        assertEquals(1, dictation.cancels)
        listener.onFinal("hola equipo")
        assertEquals("hola equipo, ¿qué tal?", model.chatDraft.text)

        // Dictar en «Nueva tarea» va a su caja, no a la del chat.
        model.startDictation(VoiceTarget.NewTask, noteFallback = false)
        dictation.listener!!.onFinal("resume la carpeta")
        assertEquals("resume la carpeta", model.newTaskDraft.text)
        assertEquals("hola equipo, ¿qué tal?", model.chatDraft.text)
        model.cancelDictation()
        assertNull(model.dictation)
    }

    @Test
    fun aFailureSaysToHoldForAVoiceNoteWhenTheComputerHasOne() {
        val dictation = FakeDictation()
        val model = orbitaModelForTests(FakeController(SampleData.state()), liveDictation = dictation)
        model.startDictation(VoiceTarget.Chat, noteFallback = true)
        dictation.listener!!.onError(DictationError.Network, heardNothing = true)
        dictation.listener!!.onEnd()
        assertNull(model.dictation)
        assertEquals(
            "El dictado del móvil necesita internet. Mantén pulsado el micrófono para grabar una nota de voz.",
            model.toasts.lastOrNull()?.text,
        )
    }
}
