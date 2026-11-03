package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.model.Author
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.PlanProposal
import com.aicowork.remote.data.model.ProposedTask
import com.aicowork.remote.data.store.InMemoryPreferencesStore
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** El plan de Hermes espera tu visto bueno, los entregables van juntos en una carpeta y, plegado, el chat ocupa toda la pantalla. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PlanAndFoldedChatTest {
    @get:Rule
    val compose = createComposeRule()

    private fun show(controller: FakeController, prefs: InMemoryPreferencesStore = InMemoryPreferencesStore()): OrbitaModel {
        val model = orbitaModelForTests(controller, prefs)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.waitForIdle()
        return model
    }

    private fun withMessages(vararg extra: ChatMessage, artifacts: List<Artifact> = emptyList()): CoworkUiState {
        val s = SampleData.state()
        val snap = s.snapshot!!
        return s.copy(
            snapshot = snap.copy(
                conversation = snap.conversation.copy(messages = snap.conversation.messages + extra, artifacts = snap.conversation.artifacts + artifacts),
                capabilities = snap.capabilities.copy(planApproval = true),
            ),
        )
    }

    private val plan = PlanProposal(
        "pending",
        listOf(
            ProposedTask("web", "Programar la web", "Crea **index.html** con la portada", "dev", acceptance = "La página carga sin errores"),
            ProposedTask("tests", "Escribir las pruebas", "Pruebas de la web", "dev", difficulty = "easy", dependsOn = listOf("web")),
        ),
        "Hazme una web",
    )
    private val proposal = ChatMessage("p1", requestId = "r9", author = Author("agent", "coord"), text = "He entendido que quieres una web. El Constructor la programa y luego la prueba.", createdAt = 9, proposal = plan)

    @Test
    fun aPlanWaitsForYourApprovalAndTheButtonsAskTheComputer() {
        val controller = FakeController(withMessages(proposal))
        show(controller)
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag("proposal-p1"))
        compose.onNodeWithText("Plan propuesto: espera tu visto bueno").assertIsDisplayed()
        compose.onNodeWithText("1 agente · 2 tareas").assertIsDisplayed()
        compose.onNodeWithText("Programar la web").assertIsDisplayed()
        compose.onNodeWithText(" tras 1").assertIsDisplayed()
        // Al tocar una tarea se ve qué hará.
        compose.onNodeWithText("Programar la web").performClick()
        compose.onNodeWithText("Dificultad normal · Hecha cuando: La página carga sin errores").assertIsDisplayed()
        // Lo que escribas son cambios al plan (o «sí»).
        compose.onNodeWithText("Qué cambiar del plan, o «sí»…").assertExists()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag("plan-approve"))
        compose.onNodeWithTag("plan-approve").performClick()
        compose.waitUntil(5_000) { "plan:p1:approve" in controller.calls }
        // El aviso es la respuesta del ordenador, no un éxito supuesto.
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Hecho")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun discardingAPlanAlsoAsksTheComputerAndAnApprovedPlanShowsItsTasks() {
        val approved = proposal.copy(id = "p2", proposal = plan.copy(status = "approved"), taskIds = listOf("t1", "t2"))
        val controller = FakeController(withMessages(proposal, approved))
        show(controller)
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag("plan-reject"))
        compose.onNodeWithTag("plan-reject").performClick()
        compose.waitUntil(5_000) { "plan:p1:reject" in controller.calls }
        // Aprobado: sus tareas con el estado en vivo.
        compose.onNodeWithTag("chat-list").performScrollToNode(hasText("Plan en marcha · 0 de 2 hechas"))
        compose.onAllNodesWithText("Construir pantallas").fetchSemanticsNodes().isNotEmpty().let(::assertTrue)
    }

    @Test
    fun severalDeliverablesGoTogetherInAFolderThatOpens() {
        val shots = (1..4).map { Artifact("d$it", "c1", taskId = "t1", agentId = "dev", name = "0$it-pantalla.png", relPath = "artifacts/mobile-app-concepts/0$it-pantalla.png", kind = "image", size = 2000) }
        val delivered = ChatMessage("d", requestId = "r1", author = Author("agent", "dev"), text = "Creé 4 pantallas.", createdAt = 10, artifactIds = shots.map { it.id })
        val controller = FakeController(withMessages(delivered, artifacts = shots))
        val model = show(controller)
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag("deliverables-d"))
        compose.onNodeWithText("mobile-app-concepts").assertIsDisplayed()
        compose.onNodeWithText("4 archivos · 4 imágenes · por Constructor").assertIsDisplayed()
        // Plegada: los archivos no llenan el chat.
        compose.onAllNodesWithText("01-pantalla.png").assertCountEquals(0)
        compose.onNodeWithText("mobile-app-concepts").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasText("04-pantalla.png"))
        compose.onNodeWithText("04-pantalla.png").performClick()
        assertEquals(ViewerTarget.Result("d4", "04-pantalla.png", "image"), model.viewer)
    }

    @Test
    @Config(qualifiers = "w475dp-h751dp")
    fun foldedTheArrowsPutTheChatFullScreenAndItIsRemembered() {
        val prefs = InMemoryPreferencesStore()
        val controller = FakeController(SampleData.state())
        val model = show(controller, prefs)
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.waitForIdle()
        val screen = compose.onNodeWithTag("orbita").fetchSemanticsNode().boundsInRoot.height
        val before = compose.onNodeWithTag("panel").fetchSemanticsNode().boundsInRoot.height
        compose.onNodeWithTag("bottom-nav").assertIsDisplayed()
        assertTrue("sin ampliar deja sitio a la navegación ($before de $screen)", before < screen * 0.75f)

        compose.onNodeWithTag("panel-expand").performClick()
        compose.waitForIdle()
        assertTrue(prefs.preferences.value.foldedFullPanels)
        compose.onAllNodesWithTag("bottom-nav").assertCountEquals(0)
        compose.onAllNodesWithTag("project-chip").assertCountEquals(0)
        val full = compose.onNodeWithTag("panel").fetchSemanticsNode().boundsInRoot.height
        assertTrue("pantalla completa ($full de $screen)", full > screen * 0.9f)

        // Al cerrarlo y volver a abrirlo, sigue a pantalla completa.
        compose.onNodeWithTag("panel-close").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("bottom-nav").assertIsDisplayed()
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.waitForIdle()
        compose.onAllNodesWithTag("bottom-nav").assertCountEquals(0)
        assertEquals(Section.Chat, model.section)

        // Las flechas lo devuelven a su tamaño.
        compose.onNodeWithTag("panel-expand").performClick()
        compose.waitForIdle()
        assertFalse(prefs.preferences.value.foldedFullPanels)
        compose.onNodeWithTag("bottom-nav").assertIsDisplayed()
    }
}
