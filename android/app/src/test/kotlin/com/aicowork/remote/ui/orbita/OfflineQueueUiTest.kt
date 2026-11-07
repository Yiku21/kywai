package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.OutgoingMessage
import com.aicowork.remote.data.OutgoingStatus
import com.aicowork.remote.data.QueuedFile
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Sin conexión: la barra de arriba cuenta lo que hay en cola, y un mensaje en cola se puede editar o descartar. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OfflineQueueUiTest {
    @get:Rule
    val compose = createComposeRule()

    private val photo = QueuedFile("f1", "foto.jpg", 4, "image/jpeg", "/no/existe/foto.jpg")

    private fun offline() = SampleData.state().copy(
        connection = Connection.Offline("Sin red", null),
        outgoing = listOf(
            OutgoingMessage("q1", "Revisa el informe", 0, OutgoingStatus.Queued, files = listOf(photo)),
            OutgoingMessage("q2", "Y luego el correo", 1, OutgoingStatus.Queued),
        ),
    )

    @Test
    fun theTopBarSaysHowManyMessagesAreQueued() {
        val controller = FakeController(offline())
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(orbitaModelForTests(controller), "Pixel", null) } }
        compose.onNodeWithText("Sin conexión · 2 en cola").assertIsDisplayed()
    }

    @Test
    fun aQueuedMessageGoesBackToTheComposerWithItsPhoto() {
        val controller = FakeController(offline())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(androidx.compose.ui.test.hasText("foto.jpg", substring = true))
        compose.onNodeWithText("foto.jpg", substring = true).assertIsDisplayed()

        compose.onAllNodes(androidx.compose.ui.test.hasTestTag("queued-edit"))[0].performClick()
        compose.waitForIdle()
        assertTrue("takeBack:q1" in controller.calls)
        assertEquals("Revisa el informe", model.chatDraft.text)
        assertTrue(photo.localId in model.pendingAttachments)
        compose.onNodeWithText("Sin conexión · 1 en cola").assertIsDisplayed()

        compose.onNodeWithTag("chat-list").performScrollToNode(androidx.compose.ui.test.hasTestTag("queued-discard"))
        compose.onNodeWithTag("queued-discard").performClick()
        assertTrue("discard:q2" in controller.calls)
    }
}
