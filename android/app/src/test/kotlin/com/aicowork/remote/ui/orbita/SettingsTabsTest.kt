package com.aicowork.remote.ui.orbita

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Ajustes con pestañas como el escritorio, y el tema que manda el ordenador. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w1280dp-h800dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsTabsTest {
    @get:Rule
    val compose = createComposeRule()

    @After
    fun reset() {
        Orbita.palette = OrbitaPalette(OrbitaThemes.Default)
    }

    @Test
    fun theThemeOfTheComputerPaintsOrbitaAndSettingsHaveTabs() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val model = orbitaModelForTests(FakeController(base.copy(snapshot = snap.copy(settings = snap.settings.copy(theme = "mundo-grafito")))))
        compose.setContent { OrbitaApp(model, "Pixel", null) }
        compose.waitForIdle()
        assertEquals(Color(0xFFE0A34A), Orbita.Accent)
        assertEquals("mundo-grafito", model.world.theme)

        compose.onNodeWithTag("nav-Settings").performClick()
        compose.onNodeWithTag("settings-tabs").assertIsDisplayed()
        compose.onNodeWithText("Grafito").assertIsDisplayed()
        compose.onNodeWithText("Conexión").performClick()
        compose.onNodeWithText("Desvincular este móvil").assertIsDisplayed()
        compose.onNodeWithText("Agentes").performClick()
        compose.onNodeWithTag("settings-team").performClick()
        compose.waitForIdle()
        assertEquals(Section.Team, model.section)
    }
}
