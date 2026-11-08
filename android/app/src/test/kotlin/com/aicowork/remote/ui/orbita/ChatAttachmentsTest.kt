package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.model.Attachment
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Los adjuntos del chat se abren en el lector (como en el escritorio) y ahí se pasa de uno a otro con ‹ ›. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ChatAttachmentsTest {
    @get:Rule
    val compose = createComposeRule()

    private val photo = Attachment("f1", "captura.png", "attachments/captura.png", "image/png", 300)
    private val notes = Attachment("f2", "notas.md", "attachments/notas.md", "text/markdown", 20)

    @Test
    fun anAttachmentOpensInTheViewerAndTheArrowsGoToTheOthers() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        compose.setContent {
            val state by controller.state.collectAsState()
            Box(Modifier.fillMaxSize()) {
                ChatAttachments(listOf(photo, notes), model, canOpen = true)
                Overlays(model, state)
            }
        }
        compose.waitForIdle()
        // El servidor de pruebas no devuelve una imagen: la miniatura vuelve a ser una ficha con su nombre.
        assertTrue("file:attachment:attachments/captura.png" in controller.calls)
        compose.onNodeWithTag("attachment-f2").performClick()
        compose.waitForIdle()
        assertEquals(ViewerTarget.File("attachment", "attachments/notas.md", "notas.md", "markdown"), model.viewer)
        assertEquals(2, model.viewerItems.size)
        compose.onNodeWithText("2 de 2").assertIsDisplayed()
        compose.onNodeWithTag("viewer-next").performClick()
        compose.waitForIdle()
        assertEquals("captura.png", model.viewer?.title)
        compose.onNodeWithText("1 de 2").assertIsDisplayed()
    }

    @Test
    fun markdownCanBeSeenAsCodeAndCopied() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        compose.setContent {
            val state by controller.state.collectAsState()
            Box(Modifier.fillMaxSize()) { Overlays(model, state) }
        }
        model.openViewer(listOf(ViewerTarget.File("attachment", "attachments/notas.md", "notas.md", "markdown")), 0)
        compose.waitForIdle()
        compose.onNodeWithTag("viewer-source").assertIsDisplayed()
        compose.onNodeWithText("Código").performClick()
        compose.onNodeWithText("fun main() {}").assertIsDisplayed()
        compose.onNodeWithTag("viewer-copy").performClick()
        compose.waitForIdle()
        assertTrue("el lector se cerró al cambiar de vista", model.viewer != null)
    }
}
