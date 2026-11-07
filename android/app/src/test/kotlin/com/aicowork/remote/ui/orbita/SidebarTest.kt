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
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsEnabled
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

    private fun controller(menus: Boolean = false, running: Boolean = true): FakeController {
        val base = SampleData.state()
        val snap = base.snapshot!!.let { s -> s.copy(projects = s.projects.map { it.copy(running = running && it.running, pinned = menus && it.id == "c2") }) }
        return FakeController(
            base.copy(
                snapshot = snap.copy(
                    conversation = snap.conversation.copy(chat = OpenChat("ch1", "Pantallas de la app")),
                    capabilities = snap.capabilities.copy(chats = true, search = true, serverName = true, chatActions = menus, projectActions = menus),
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

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun collapsedItStaysAsARailWithTheLogoAndUsableIcons() {
        val controller = controller()
        val model = show(controller)
        compose.runOnIdle { model.sidebarOpen = false }
        compose.onAllNodesWithTag("sidebar").assertCountEquals(0)
        compose.onNodeWithTag("sidebar-rail").assertIsDisplayed()
        compose.onNodeWithTag("rail-Tasks").performClick()
        compose.waitForIdle()
        assertTrue(model.section == Section.Tasks)
        compose.onNodeWithTag("rail-new-chat").performClick()
        compose.waitUntil(5_000) { "newChat" in controller.calls }
        compose.onNodeWithTag("sidebar-toggle").performClick()
        compose.onNodeWithTag("sidebar").assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    fun onThePhoneTheSlimRailIsAlwaysThere() {
        val controller = controller()
        val model = show(controller)
        compose.onNodeWithTag("sidebar-rail").assertIsDisplayed()
        compose.onNodeWithTag("rail-Results").performClick()
        compose.waitForIdle()
        assertTrue(model.section == Section.Results && !model.drawerOpen)
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun theComputerNameCanBeRenamed() {
        val controller = controller()
        show(controller)
        compose.onNodeWithTag("server-name").performClick()
        compose.onNode(hasSetTextAction()).performTextClearance()
        compose.onNode(hasSetTextAction()).performTextInput("Mac de casa")
        compose.onNodeWithTag("server-name-save").performClick()
        compose.waitUntil(5_000) { "serverName:Mac de casa" in controller.calls }
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun holdingAProjectOpensItsMenuAndDeletesItAfterConfirming() {
        val controller = controller(menus = true)
        show(controller)
        // c2 está fijado: sale en «Fijados» y también en «Proyectos».
        compose.onNodeWithTag("side-pinned").assertIsDisplayed()
        compose.onNodeWithTag("project-c2").performTouchInput { longClick() }
        compose.onNodeWithTag("menu-new-chat").assertIsDisplayed()
        compose.onNodeWithText("Soltar de Fijados").assertIsDisplayed()
        compose.onNodeWithTag("menu-delete").performClick()
        compose.onNodeWithText("Eliminar").performClick()
        compose.waitUntil(5_000) { "deleteProject:c2" in controller.calls }
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun aProjectWithWorkInProgressCannotBeDeleted() {
        val controller = controller(menus = true)
        show(controller)
        compose.onNodeWithTag("project-c1").performTouchInput { longClick() }
        compose.onNodeWithTag("menu-delete").assertIsNotEnabled()
        compose.onNodeWithTag("menu-rename").performClick()
        compose.onNodeWithText("Guardar").assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun holdingAChatOffersPinForkMoveAndDeleteEvenTheOpenOne() {
        val controller = controller(menus = true, running = false)
        show(controller)
        compose.waitUntil(5_000) { "chats:c1" in controller.calls }
        compose.onNodeWithTag("chat-ch0").performTouchInput { longClick() }
        compose.onNodeWithTag("menu-move").performClick()
        compose.onNodeWithTag("move-to-c2").performClick()
        compose.waitUntil(5_000) { "moveChat:ch0:c2" in controller.calls }
        compose.onNodeWithTag("chat-ch1").performTouchInput { longClick() }
        compose.onNodeWithTag("menu-delete").assertIsEnabled().performClick()
        compose.onNodeWithText("Eliminar").performClick()
        compose.waitUntil(5_000) { "deleteChat:ch1" in controller.calls }
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun withAnOlderComputerTheOpenChatCannotBeDeleted() {
        val controller = controller(menus = false, running = false)
        show(controller)
        compose.waitUntil(5_000) { "chats:c1" in controller.calls }
        compose.onNodeWithTag("chat-ch1").performTouchInput { longClick() }
        compose.onAllNodesWithTag("menu-fork").assertCountEquals(0)
        compose.onNodeWithTag("menu-delete").assertIsNotEnabled()
    }
}
