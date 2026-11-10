package com.aicowork.remote.ui.orbita

import android.os.Looper
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Las marcas de «/video» se leen y se escriben igual que en el escritorio (src/shared/videoChoice.ts). */
class VideoTagsTest {
    @Test
    fun readsTheTags() {
        assertEquals(VideoChoice(), VideoTags.choiceOf("/video un tutorial"))
        assertEquals(
            VideoChoice("mixto", "robots-kywai", "watercolor", "edge-es-MX-JorgeNeural"),
            VideoTags.choiceOf("/video tipo:mixto personaje:robots-kywai estilo:watercolor voz:edge-es-MX-JorgeNeural cómo hacer pan"),
        )
        // El estilo pintado a mano lleva los robots salvo «personaje:ninguno»; «estilo:cartoon» es el tipo de antes.
        assertEquals("robots-kywai", VideoTags.choiceOf("/video estilo:kywai-pintado x").character)
        assertNull(VideoTags.choiceOf("/video personaje:ninguno estilo:kywai-pintado x").character)
        assertEquals("presentador", VideoTags.choiceOf("/video estilo:cartoon x").kind)
        assertNull(VideoTags.choiceOf("/video estilo:no-existe x", setOf("watercolor")).style)
        assertEquals("kokoro-ef_dora", VideoTags.choiceOf("/vídeo voz:kokoro-ef_dora x").voice)
    }

    @Test
    fun writesTheTagsBehindTheCommand() {
        assertEquals("/video tipo:mixto estilo:watercolor pan casero", VideoTags.withChoice("/video pan casero", VideoChoice("mixto", null, "watercolor")))
        assertEquals("/video pan casero", VideoTags.withChoice("/video tipo:mixto estilo:watercolor pan casero", VideoChoice()))
        assertEquals("/video personaje:ninguno estilo:kywai-pintado ", VideoTags.withChoice("/video ", VideoChoice(style = "kywai-pintado")))
        assertEquals("/video voz:edge-es-MX-JorgeNeural ", VideoTags.withChoice("/video ", VideoChoice(voice = "edge-es-MX-JorgeNeural")))
        assertEquals("hola", VideoTags.withChoice("hola", VideoChoice("mixto")))
        assertTrue(VideoTags.isVideoCommand("  /Vídeo algo"))
        assertFalse(VideoTags.isVideoCommand("/videos"))
        assertTrue(VideoTags.justStarted("/video "))
        assertFalse(VideoTags.justStarted("/video x"))
    }
}

/** Al escribir «/video » en el chat de Órbita sale el selector de tipo, personaje, estilo y voz, como en el escritorio. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class VideoPickerUiTest {
    @get:Rule
    val compose = createComposeRule()

    private fun idleMain() = shadowOf(Looper.getMainLooper()).idle()

    private fun withPicker() = SampleData.state().let { s -> s.copy(snapshot = s.snapshot!!.copy(capabilities = s.snapshot!!.capabilities.copy(videoPicker = true))) }

    @Test
    fun choosingKindCharacterStyleAndVoiceWritesTheTags() {
        val controller = FakeController(withPicker())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("/video ")
        compose.waitUntil(5_000) { idleMain(); model.videoPickerOpen && "videoPicker" in controller.calls }
        compose.onNodeWithTag("video-picker").assertIsDisplayed()

        compose.onNodeWithTag("video-kind-mixto").performClick()
        compose.onNodeWithTag("video-character-robots-kywai").performScrollTo().performClick()
        compose.onNodeWithTag("video-style-watercolor").performScrollTo().performClick()
        compose.onNodeWithTag("video-voice-edge-es-MX-JorgeNeural").performScrollTo().performClick()
        assertEquals("/video tipo:mixto personaje:robots-kywai estilo:watercolor voz:edge-es-MX-JorgeNeural ", model.chatDraft.text)

        // La voz por defecto no lleva marca.
        compose.onNodeWithTag("video-voice-edge-es-ES-AlvaroNeural").performScrollTo().performClick()
        assertEquals("/video tipo:mixto personaje:robots-kywai estilo:watercolor ", model.chatDraft.text)

        // ▶ pide la muestra al ordenador.
        compose.onNodeWithTag("video-voice-play-edge-es-MX-JorgeNeural").performScrollTo().performClick()
        compose.waitUntil(5_000) { idleMain(); "videoVoicePreview:edge-es-MX-JorgeNeural" in controller.calls }

        compose.onNodeWithTag("video-picker-done").performClick()
        compose.waitUntil(5_000) { idleMain(); !model.videoPickerOpen }
        compose.onNodeWithTag("video-bar").assertIsDisplayed()
        // Al tocar la barra se vuelve a abrir.
        compose.onNodeWithTag("video-bar").performClick()
        compose.waitUntil(5_000) { idleMain(); model.videoPickerOpen }
    }

    @Test
    fun addingACharacterSavesItAndChoosesIt() {
        val controller = FakeController(withPicker())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("/video ")
        compose.waitUntil(5_000) { idleMain(); model.videoPickerOpen && "videoPicker" in controller.calls }
        compose.onNodeWithTag("video-character-add").performScrollTo().performClick()
        compose.onNodeWithTag("video-character-name").performTextInput("Doña Rosa")
        compose.onNodeWithTag("video-character-about").performTextInput("Abuela panadera")
        compose.onNodeWithTag("video-character-save").performClick()
        compose.waitUntil(5_000) { idleMain(); "addVideoCharacter:Doña Rosa:Abuela panadera" in controller.calls }
        compose.waitUntil(5_000) { idleMain(); "personaje:dona-rosa-1" in model.chatDraft.text }
        compose.onNodeWithTag("video-character-dona-rosa-1").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun withAnOlderComputerThereIsNoPicker() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("/video ")
        compose.waitForIdle()
        assertFalse(model.videoPickerOpen)
        compose.onNodeWithTag("video-bar").assertDoesNotExist()
    }
}
