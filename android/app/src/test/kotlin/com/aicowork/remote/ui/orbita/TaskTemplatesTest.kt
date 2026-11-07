package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.model.TaskTemplate
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

/** Plantillas de tareas encima del chat: un toque la envía, con huecos antes se rellenan, y su menú al mantenerla pulsada. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TaskTemplatesTest {
    @get:Rule
    val compose = createComposeRule()

    private val templates = listOf(
        TaskTemplate(id = "t1", name = "Actualizar", icon = "📦", command = "actualizar", prompt = "Actualiza las dependencias.", createdAt = 1),
        TaskTemplate(id = "t2", name = "Revisar PR", command = "revisar-pr", prompt = "Revisa el PR {pr} del repo {repo}", createdAt = 2),
        TaskTemplate(id = "t3", name = "De otro", command = "otro", prompt = "x", projectId = "otro-proyecto", createdAt = 3),
    )

    private fun controller(enabled: Boolean = true): FakeController {
        val base = SampleData.state()
        val snap = base.snapshot!!
        return FakeController(base.copy(snapshot = snap.copy(templates = templates, capabilities = snap.capabilities.copy(templates = enabled))))
    }

    private fun show(controller: FakeController): OrbitaModel {
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        return model
    }

    @Test
    fun rules() {
        assertEquals(listOf("pr", "carpeta-origen"), TemplateRules.slots("Revisa {pr} y {pr} en {carpeta-origen}; {\"a\": 1} no"))
        assertEquals(listOf("文件夹"), TemplateRules.slots("Lee {文件夹}"))
        assertEquals("Revisa 42 en", TemplateRules.fill("Revisa {pr} en {repo}", mapOf("pr" to " 42 ")))
        assertEquals("Nombre del archivo", TemplateRules.label("nombre-del_archivo"))
        assertEquals("revisar-pr", TemplateRules.commandFromName("Revisar PR"))
        assertEquals("explicar-codigo", TemplateRules.commandFromName("Explicar código"))
        assertEquals("p-2-resumenes", TemplateRules.commandFromName("2 resúmenes"))
        assertEquals("rev", TemplateRules.commandQuery("/rev"))
        assertNull(TemplateRules.commandQuery("/rev algo"))
        val pinned = templates + TaskTemplate(id = "t4", name = "Fija", prompt = "y", pinned = true, createdAt = 9)
        assertEquals(listOf("t4", "t1", "t2"), TemplateRules.forProject(pinned, "c1").map { it.id })
    }

    @Test
    fun aTapSendsTheOneWithoutBlanks() {
        val controller = controller()
        show(controller)
        compose.onNodeWithTag("templates").assertIsDisplayed()
        compose.onAllNodesWithTag("template-t3").assertCountEquals(0)
        compose.onNodeWithTag("template-t1").performClick()
        compose.waitUntil(5_000) { "template:t1:Actualiza las dependencias.:" in controller.calls }
    }

    // Un AlertDialog con tamaño de móvil no llega a quedarse quieto en Robolectric: los cuadros se prueban en tableta.
    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun withBlanksItAsksForThemFirst() {
        val controller = controller()
        show(controller)
        compose.onNodeWithTag("template-t2").performClick()
        compose.onNodeWithTag("template-send").assertIsNotEnabled()
        compose.onNodeWithTag("template-slot-0").performTextInput("42")
        compose.onNodeWithTag("template-slot-1").performTextInput("kywai")
        compose.onNodeWithTag("template-send").assertIsEnabled().performClick()
        compose.waitUntil(5_000) { "template:t2:Revisa el PR 42 del repo kywai:" in controller.calls }
    }

    @Test
    @Config(qualifiers = "w1280dp-h800dp")
    fun theBlanksDialogFillsTheText() {
        var sent: String? = null
        compose.setContent { FillDialog(templates[1], onDismiss = {}) { sent = it } }
        compose.onNodeWithTag("template-send").assertIsNotEnabled()
        compose.onNodeWithTag("template-slot-0").performTextInput("42")
        compose.onNodeWithTag("template-slot-1").performTextInput("kywai")
        compose.onNodeWithTag("template-send").assertIsEnabled().performClick()
        compose.runOnIdle { assertEquals("Revisa el PR 42 del repo kywai", sent) }
    }

    @Test
    fun longPressOpensItsMenu() {
        val controller = controller()
        show(controller)
        compose.onNodeWithTag("template-t1").performTouchInput { longClick() }
        compose.onNodeWithTag("template-menu-pin").performClick()
        compose.waitUntil(5_000) { "updateTemplate:t1:true" in controller.calls }
        compose.onNodeWithTag("template-t1").performTouchInput { longClick() }
        compose.onNodeWithTag("template-menu-delete").performClick()
        compose.onNodeWithTag("template-new").assertIsDisplayed()
        assertTrue(controller.calls.none { it.startsWith("deleteTemplate") })
    }

    @Test
    fun typingASlashListsTheirCommands() {
        val controller = controller()
        val model = show(controller)
        compose.runOnIdle { model.chatDraft = androidx.compose.ui.text.input.TextFieldValue("/rev") }
        compose.onNodeWithTag("template-command-t2").assertIsDisplayed().performClick()
        compose.runOnIdle { assertEquals("/revisar-pr ", model.chatDraft.text) }
    }

    @Test
    fun anOlderComputerShowsNoRow() {
        show(controller(enabled = false))
        compose.onAllNodesWithTag("templates").assertCountEquals(0)
    }
}
