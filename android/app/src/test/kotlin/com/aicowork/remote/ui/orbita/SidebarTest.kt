package com.aicowork.remote.ui.orbita

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.model.OpenChat
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** La barra lateral como en el escritorio: cada proyecto con sus chats, chat nuevo y buscador. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SidebarTest {
    @get:Rule
    val compose = createComposeRule()

    private fun controller(): FakeController {
        val base = SampleData.state()
        val snap = base.snapshot!!
        return FakeController(
            base.copy(
                snapshot = snap.copy(
                    conversation = snap.conversation.copy(chat = OpenChat("ch1", "Pantallas de la app")),
                    capabilities = snap.capabilities.copy(chats = true, search = true),
                ),
            ),
        )
    }

    private fun show(controller: FakeController): OrbitaModel {
        val model = orbitaModelForTests(controller)
        compose.setContent { OrbitaApp(model, "Pixel", null) }
        compose.waitForIdle()
        return model
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun unfoldedListsTheChatsOfTheProjectAndOpensAnother() {
        val controller = controller()
        show(controller)
        compose.onNodeWithTag("sidebar").assertIsDisplayed()
        compose.waitUntil(5_000) { "chats:c1" in controller.calls }
        compose.onNodeWithTag("chat-ch0").performClick()
        compose.waitUntil(5_000) { "openChat:c1:ch0" in controller.calls }
        compose.onNodeWithTag("side-new-chat").performClick()
        compose.waitUntil(5_000) { "newChat" in controller.calls }
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun searchFindsAndOpensTheChat() {
        val controller = controller()
        show(controller)
        compose.onNodeWithTag("side-search").performClick()
        compose.onNodeWithTag("search").assertIsDisplayed()
        compose.onNode(hasSetTextAction() and hasAnyAncestor(hasTestTag("search"))).performTextInput("informe")
        compose.waitUntil(5_000) { "search:informe" in controller.calls }
        compose.onNodeWithText("…el informe semanal…").performClick()
        compose.waitUntil(5_000) { "openChat:c1:ch0" in controller.calls }
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    fun foldedTheMenuOpensTheSidebarAsADrawer() {
        val controller = controller()
        val model = show(controller)
        compose.onAllNodesWithTag("sidebar").assertCountEquals(0)
        compose.onNodeWithTag("menu-button").performClick()
        compose.onNodeWithTag("sidebar").assertIsDisplayed()
        compose.onNode(hasTestTag("nav-Tasks") and hasAnyAncestor(hasTestTag("sidebar"))).performClick()
        compose.waitForIdle()
        assertTrue(!model.drawerOpen && model.section == Section.Tasks)
    }
}
