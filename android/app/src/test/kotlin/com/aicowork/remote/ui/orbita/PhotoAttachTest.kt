package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.Upload
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** En el chat, al lado del clip, un botón de cámara: hacer una foto o elegirla de la galería, y va con el próximo mensaje. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PhotoAttachTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theCameraButtonOffersOnlyTakingAPhotoOrTheGallery() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()

        compose.onNodeWithTag("photo").assertIsDisplayed().performClick()
        compose.onNodeWithText("Hacer una foto").assertIsDisplayed()
        compose.onNodeWithText("Elegir de la galería").assertIsDisplayed()
        // «Desde archivos» no: para eso ya está el clip.
        assertTrue(compose.onAllNodesWithTextCount("Desde archivos") == 0)
    }

    @Test
    fun aPhotoUploadedFromTheChatGoesWithTheNextMessage() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()

        val attachment = SampleData.state().snapshot!!.conversation.attachments.first()
        controller.state.value = controller.state.value.copy(uploads = listOf(Upload("u1", "foto-1.jpg", progress = 0.4f)))
        compose.onNodeWithText("Subiendo foto-1.jpg…").assertIsDisplayed()

        controller.state.value = controller.state.value.copy(uploads = listOf(Upload("u1", "foto-1.jpg", progress = 1f, done = true, attachmentId = attachment.id)))
        compose.waitForIdle()
        assertTrue("la foto no quedó adjunta al próximo mensaje", attachment.id in model.pendingAttachments)
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTextCount(text: String) =
        onAllNodes(androidx.compose.ui.test.hasText(text)).fetchSemanticsNodes().size
}
