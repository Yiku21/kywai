package com.aicowork.remote.ui.orbita

import android.os.Looper
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** «/model» en el chat de Órbita abre la lista de modelos de Hermes (no se le manda a Hermes). */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class HermesModelUiTest {
    @get:Rule
    val compose = createComposeRule()

    private fun idleMain() = shadowOf(Looper.getMainLooper()).idle()

    @Test
    fun slashModelOpensTheListAndChangesHermesModel() {
        val state = SampleData.state().let { s -> s.copy(snapshot = s.snapshot!!.copy(capabilities = s.snapshot!!.capabilities.copy(hermesModel = true))) }
        val controller = FakeController(state)
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("/model")
        compose.onNodeWithTag("send").performClick()
        compose.waitUntil(5_000) { idleMain(); "hermesModels" in controller.calls }
        assertFalse(controller.calls.any { it.startsWith("send:") })
        assertTrue(model.hermesModelOpen)
        assertEquals("", model.chatDraft.text)
        compose.onNodeWithTag("hermes-current").assertIsDisplayed()
        compose.onNodeWithText("el de la configuración de Hermes", substring = true).assertIsDisplayed()

        // Otro proveedor, buscar y usar.
        compose.onNodeWithText("Anthropic").performClick()
        compose.onNodeWithTag("hermes-search").performTextInput("opus")
        compose.onNodeWithText("claude-opus-5-5").performClick()
        compose.onNodeWithText("Usar claude-opus-5-5").performClick()
        compose.waitUntil(5_000) { idleMain(); "hermesModel:anthropic/claude-opus-5-5" in controller.calls }
        compose.waitUntil(5_000) { idleMain(); runCatching { compose.onNodeWithText("elegido en kywai", substring = true).assertExists() }.isSuccess }

        // Y volver al de Hermes.
        compose.onNodeWithText("Volver al de Hermes").performClick()
        compose.waitUntil(5_000) { idleMain(); "hermesModel:reset" in controller.calls }
    }

    @Test
    fun withAnOlderComputerItSaysToUpdateInsteadOfAskingHermes() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("/modelo")
        compose.onNodeWithTag("send").performClick()
        compose.waitForIdle()
        assertFalse(model.hermesModelOpen)
        assertFalse(controller.calls.any { it.startsWith("send:") })
    }
}
