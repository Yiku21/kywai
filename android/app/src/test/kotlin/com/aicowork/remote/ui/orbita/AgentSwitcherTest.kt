package com.aicowork.remote.ui.orbita

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertCountEquals
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** En vez de la barra del Equipo, un agente a la vez con ‹ ›: tocarlo abre su ficha. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AgentSwitcherTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(): OrbitaModel {
        val model = orbitaModelForTests(FakeController(SampleData.state()))
        compose.setContent { OrbitaApp(model, "Pixel", null) }
        compose.waitForIdle()
        return model
    }

    private fun check(model: OrbitaModel) {
        compose.onNodeWithTag("agent-switcher").assertIsDisplayed()
        assertNull(model.selectedAgentId)
        compose.onNodeWithTag("agent-current").performClick()
        compose.waitForIdle()
        val first = model.selectedAgentId
        assertNotEquals(null, first)
        compose.onNodeWithTag("agent-card").assertIsDisplayed()
        // Con la ficha abierta, la flecha pasa la ficha al siguiente.
        compose.onNodeWithTag("agent-next").performClick()
        compose.waitForIdle()
        assertNotEquals(first, model.selectedAgentId)
        compose.onNodeWithTag("agent-prev").performClick()
        compose.waitForIdle()
        assertEquals(first, model.selectedAgentId)
        // Tocarlo otra vez cierra la ficha.
        compose.onNodeWithTag("agent-current").performClick()
        compose.waitForIdle()
        assertNull(model.selectedAgentId)
        compose.onAllNodesWithTag("agent-card").assertCountEquals(0)
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun unfolded() = check(show())

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    fun folded() = check(show())
}
