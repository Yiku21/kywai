package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Un agente que falla se reinicia desde su tarjeta; si está bien, no aparece el botón. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AgentResetUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun aFailingAgentCanBeRestartedFromItsCard() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val agent = snap.agents.first { !it.plannerOnly }
        val failing = snap.copy(
            agents = snap.agents.map { if (it.id == agent.id) it.copy(activity = "error", reason = "[API Error: An unknown error occurred.]") else it },
            capabilities = snap.capabilities.copy(agentReset = true),
        )
        val controller = FakeController(base.copy(snapshot = failing))
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.runOnIdle { model.selectAgent(agent.id) }
        compose.onNodeWithTag("agent-reset").assertIsDisplayed().performClick()
        compose.waitUntil(5_000) { "reset:${agent.id}" in controller.calls }

        // Ya disponible: el botón desaparece.
        controller.state.value = base.copy(snapshot = failing.copy(agents = snap.agents))
        compose.waitForIdle()
        compose.onNodeWithTag("agent-reset").assertDoesNotExist()
        assertTrue(controller.calls.count { it.startsWith("reset:") } == 1)
    }
}
