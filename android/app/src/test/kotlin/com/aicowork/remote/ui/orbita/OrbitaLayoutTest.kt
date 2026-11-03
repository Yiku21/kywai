package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.LiveEvent
import com.aicowork.remote.data.store.EffectsPreference
import com.aicowork.remote.data.store.InMemoryPreferencesStore
import com.aicowork.remote.data.store.PreferencesStore
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import com.aicowork.remote.ui.space.EffectsLevel
import com.aicowork.remote.ui.space.WorldController
import com.aicowork.remote.ui.space.WorldEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Órbita en el Galaxy Z Fold8: abierto (riel, mundo y panel) y cerrado (navegación inferior y «Más»). */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OrbitaLayoutTest {
    @get:Rule
    val compose = createComposeRule()

    private val unfolded = DpSize(704.dp, 933.dp)
    private val folded = DpSize(475.dp, 751.dp)

    private fun show(
        controller: FakeController,
        prefs: PreferencesStore = InMemoryPreferencesStore(),
        world: WorldController = WorldController(),
        size: androidx.compose.runtime.MutableState<DpSize>? = null,
    ): OrbitaModel {
        val model = orbitaModelForTests(controller, prefs, world)
        compose.setContent {
            val s = size?.value
            Box(if (s != null) Modifier.size(s) else Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) }
        }
        compose.waitForIdle()
        return model
    }

    @Test
    fun unfoldedShowsRailWorldTeamAndAPanelThatExpandsAndCloses() {
        val controller = FakeController(SampleData.state())
        val model = show(controller)
        compose.onNodeWithTag("rail").assertIsDisplayed()
        compose.onNodeWithTag("team-bar").assertIsDisplayed()
        compose.onNodeWithTag("nav-Tasks").performClick()
        compose.onNodeWithTag("panel").assertIsDisplayed()
        compose.onNodeWithText("Construir pantallas").assertIsDisplayed()
        compose.onNodeWithTag("panel-expand").performClick()
        assertTrue(model.expanded)
        compose.onNodeWithTag("panel-close").performClick()
        compose.waitForIdle()
        assertEquals(Section.World, model.section)
        assertFalse(model.expanded)
    }

    @Test
    fun selectedTaskShowsItsActivityFromTheComputer() {
        val controller = FakeController(SampleData.state())
        show(controller)
        compose.onNodeWithTag("nav-Tasks").performClick()
        compose.onNodeWithTag("task-t1").performClick()
        compose.onNodeWithTag("tasks-list").performScrollToNode(hasTestTag("open-trace"))
        compose.onNodeWithTag("open-trace").performClick()
        compose.onNodeWithTag("trace").assertIsDisplayed()
        compose.waitUntil(5_000) { "trace:t1" in controller.calls }
        compose.onNodeWithText("Ejecutando: gradlew test").assertIsDisplayed()
    }

    @Test
    fun foldingKeepsTheOpenPanelAndTheDraft() {
        val size = mutableStateOf(unfolded)
        val controller = FakeController(SampleData.state())
        val model = show(controller, size = size)
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("Borrador que no se pierde")
        compose.onNodeWithTag("rail").assertIsDisplayed()

        size.value = folded
        compose.waitForIdle()
        compose.onNodeWithTag("bottom-nav").assertIsDisplayed()
        compose.onAllNodesWithTag("rail").assertCountEquals(0)
        compose.onNodeWithTag("composer").assertTextContains("Borrador que no se pierde")
        assertEquals(Section.Chat, model.section)

        size.value = unfolded
        compose.waitForIdle()
        compose.onNodeWithTag("rail").assertIsDisplayed()
        compose.onNodeWithTag("composer").assertTextContains("Borrador que no se pierde")
    }

    @Test
    @Config(qualifiers = "w475dp-h751dp")
    fun foldedMoreOpensAPanelAndAConfirmationWaitsForTheComputer() {
        val controller = FakeController(SampleData.state())
        show(controller)
        compose.onNodeWithTag("bottom-nav").assertIsDisplayed()
        compose.onNodeWithTag("nav-more").performClick()
        compose.onNodeWithTag("more-panels").assertIsDisplayed()
        compose.onNodeWithTag("more-Memory").performClick()
        compose.waitForIdle()
        compose.onAllNodesWithTag("more-panels").assertCountEquals(0)
        compose.onNodeWithTag("memory-list").performScrollToNode(hasTestTag("memory-confirm-m2"))
        compose.onNodeWithTag("memory-confirm-m2").performClick()
        compose.waitUntil(5_000) { "memoryStatus:m2:confirmed" in controller.calls }
        // El aviso es la respuesta del ordenador, no un éxito supuesto.
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Hecho")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test
    fun chatShowsAFailedSendAndRetriesIt() {
        val controller = FakeController(SampleData.state())
        show(controller)
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("composer").performTextInput("Hola equipo")
        compose.onNodeWithTag("send").performClick()
        assertTrue("send:Hola equipo" in controller.calls)
        compose.onNodeWithText("No se envió", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Reintentar").performClick()
        assertTrue("retryMessage:local-1" in controller.calls)
    }

    @Test
    fun deliveredMessagesAreMarked() {
        val base = SampleData.state()
        val snapshot = base.snapshot!!
        val messages = snapshot.conversation.messages + com.aicowork.remote.data.model.ChatMessage(
            "m9", author = com.aicowork.remote.data.model.Author("user"), text = "Ya llegó", createdAt = 9, clientMessageId = "cm9",
        )
        val state = base.copy(snapshot = snapshot.copy(conversation = snapshot.conversation.copy(messages = messages)), delivered = setOf("cm9"))
        show(FakeController(state))
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasText("Ya llegó"))
        compose.onNodeWithText("Entregado", substring = true).assertIsDisplayed()
    }

    @Test
    fun settingsDriveTheWorldAndTheFeedback() {
        val prefs = InMemoryPreferencesStore()
        val world = WorldController()
        val model = show(FakeController(SampleData.state()), prefs, world)
        compose.onNodeWithTag("nav-Settings").performClick()
        compose.onNodeWithTag("toggle-sound").performClick()
        compose.onNodeWithTag("toggle-ambient").performClick()
        compose.onNodeWithText("Suave").performClick()
        compose.waitForIdle()
        assertFalse(prefs.preferences.value.sound)
        assertFalse(model.feedback.sound)
        assertFalse(world.settings.ambient)
        assertEquals(EffectsPreference.Soft, prefs.preferences.value.effects)
        assertEquals(EffectsLevel.Soft, world.settings.effects)
    }

    @Test
    fun aRealCompletionAnimatesTheWorldAndNotifies() {
        val controller = FakeController(SampleData.state())
        val world = WorldController()
        show(controller, world = world)
        assertTrue(controller.live.tryEmit(LiveEvent.TaskCompleted("t1", "dev", "Construir pantallas")))
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Constructor terminó «Construir pantallas»")).fetchSemanticsNodes().isNotEmpty() }
        val events = mutableListOf<WorldEvent>()
        world.drain { events += it }
        assertTrue(events.any { it is WorldEvent.TaskCompleted && it.taskId == "t1" && it.agentId == "dev" })
    }

    @Test
    fun projectsResultsAndFilesComeFromTheComputer() {
        val controller = FakeController(SampleData.state())
        show(controller)
        compose.onNodeWithTag("project-chip").performClick()
        compose.onNodeWithText("Otro proyecto").performClick()
        compose.waitUntil(5_000) { "select:c2" in controller.calls }

        compose.onNodeWithTag("nav-Results").performClick()
        compose.onNodeWithText("Abrir resultado").performClick()
        compose.onNodeWithTag("viewer").assertIsDisplayed()
        compose.waitUntil(5_000) { "artifact:a1" in controller.calls }
        compose.onNodeWithText("Hola").assertIsDisplayed()
        compose.onNodeWithTag("viewer-close").performClick()

        compose.onNodeWithTag("nav-Files").performClick()
        compose.onNodeWithText("brief.pdf").assertIsDisplayed()
        compose.onNodeWithText("Proyecto").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(hasText("Main.kt")).fetchSemanticsNodes().isNotEmpty() }
    }
}
