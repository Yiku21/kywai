package com.aicowork.remote.ui.orbita

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Las imágenes que un agente pone en el chat (con la ruta de su equipo) se piden al ordenador y no salen como «!texto». */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MarkdownImagesTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun splitsImagesFromTheTextAroundThem() {
        val parts = splitImages("Mira ![Capturas reales](/Users/usuario/Proyecto/artifacts/mapas/hoja.png) y ![otra](artifacts/b.png \"título\") fin")
        assertEquals(
            listOf(
                LinePart.Text("Mira "),
                LinePart.Image("Capturas reales", "/Users/usuario/Proyecto/artifacts/mapas/hoja.png"),
                LinePart.Text(" y "),
                LinePart.Image("otra", "artifacts/b.png"),
                LinePart.Text(" fin"),
            ),
            parts,
        )
        assertEquals(listOf<LinePart>(LinePart.Text("Sin imágenes [enlace](x.md)")), splitImages("Sin imágenes [enlace](x.md)"))
    }

    @Test
    fun anImageIsRequestedFromTheComputerByItsProjectPath() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        val path = "/Users/usuario/Proyecto/artifacts/mapas/hoja.png"
        compose.setContent {
            CompositionLocalProvider(LocalMarkdownImages provides MarkdownImages(model)) {
                MarkdownText("Antes\n\n![Capturas reales]($path)\n\nDespués")
            }
        }
        compose.waitUntil(5_000) { "file:project:$path" in controller.calls }
        compose.onNodeWithText("Antes").assertIsDisplayed()
        compose.onNodeWithText("Después").assertIsDisplayed()
        // Si no se puede cargar como imagen, sale su descripción (nunca el «!» ni la ruta).
        compose.onNodeWithText("Capturas reales", substring = true).assertIsDisplayed()
        assertTrue(controller.calls.count { it == "file:project:$path" } == 1)
    }
}
