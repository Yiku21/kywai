package com.aicowork.remote.ui.orbita

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Música sin anuncios: radios de SomaFM y canciones de Audius que busca el ordenador y suenan en el móvil. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w1280dp-h800dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MusicTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun radiosAndAudiusFromTheSidebarWithAMiniPlayer() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val controller = FakeController(base.copy(snapshot = snap.copy(capabilities = snap.capabilities.copy(music = true))))
        val model = orbitaModelForTests(controller)
        compose.setContent { OrbitaApp(model, "Pixel", null) }
        compose.waitForIdle()

        compose.onNodeWithTag("side-music").performClick()
        compose.onNodeWithTag("music").assertIsDisplayed()
        compose.waitUntil(5_000) { "music:radio:" in controller.calls }
        compose.onNodeWithTag("music-radio:groovesalad").performClick()
        assertEquals("radio:groovesalad", model.music.current?.id)
        compose.onNodeWithTag("mini-player").assertIsDisplayed()

        compose.onNodeWithText("Audius").performClick()
        compose.onNodeWithTag("music").let { }
        compose.onNode(androidx.compose.ui.test.hasSetTextAction()).performTextInput("lofi")
        compose.waitUntil(5_000) { "music:audius:lofi" in controller.calls }
        compose.onNodeWithTag("music-audius:Ab12").assertIsDisplayed()

        compose.onNodeWithTag("music-stop").performClick()
        assertNull(model.music.current)
        compose.onAllNodesWithTag("mini-player").assertCountEquals(0)
        assertTrue(model.musicOpen)
    }
}
