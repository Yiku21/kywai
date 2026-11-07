package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** El agente local (LM Studio) enciende y apaga su razonamiento desde la tarjeta; los demás no tienen el interruptor. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AgentThinkingUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theLocalAgentTogglesThinkingFromItsCard() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val agent = snap.agents.first { !it.plannerOnly }
        val other = snap.agents.first { it.id != agent.id }
        val local = snap.copy(
            agents = snap.agents.map { if (it.id == agent.id) it.copy(provider = "lmstudio", thinking = false) else it },
            capabilities = snap.capabilities.copy(agentThinking = true),
        )
        val controller = FakeController(base.copy(snapshot = local))
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.runOnIdle { model.selectAgent(agent.id) }
        compose.onNodeWithTag("agent-thinking").assertIsDisplayed().assertIsOff().performClick()
        compose.waitUntil(5_000) { "thinking:${agent.id}:true" in controller.calls }
        compose.onNodeWithTag("agent-thinking").assertIsOn()

        compose.runOnIdle { model.selectAgent(other.id) }
        compose.waitForIdle()
        compose.onNodeWithTag("agent-thinking").assertDoesNotExist()
    }
}
