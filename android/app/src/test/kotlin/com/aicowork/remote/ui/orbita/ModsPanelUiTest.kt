package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.model.ModPanelInfo
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Paneles de los mods en Órbita: salen en «Más» solo si el ordenador los admite, y abren la página del panel. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ModsPanelUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theModsSectionOpensThePanelOfAnEnabledMod() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val controller = FakeController(base.copy(snapshot = snap.copy(capabilities = snap.capabilities.copy(modPanels = true))))
        controller.modPanelsList = listOf(ModPanelInfo("notas", "Notas rápidas", "equipo", "Estado del equipo", chat = true))
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.runOnIdle { model.open(Section.Mods) }
        compose.waitUntil(5_000) { "modPanel:notas:equipo" in controller.calls }
        compose.onNodeWithTag("mod-panel").assertIsDisplayed()
    }

    @Test
    @Config(qualifiers = "w475dp-h751dp")
    fun withoutSupportThereIsNoModsEntry() {
        val controller = FakeController(SampleData.state())
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("menu-button").performClick()
        compose.onNodeWithTag("side-more").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("nav-Memory").assertIsDisplayed()
        compose.onNodeWithTag("nav-Mods").assertDoesNotExist()
    }

    @Test
    fun thePanelReadsTheSameContextAsOnTheDesktop() {
        val snap = SampleData.state().snapshot!!
        val ctx = Json.parseToJsonElement(modContext(snap)).jsonObject
        assertEquals("context", ctx["kywai"]!!.jsonPrimitive.content)
        assertEquals(minOf(30, snap.tasks.size), ctx["tasks"]!!.jsonArray.size)
        assertTrue(ctx["tasks"]!!.jsonArray.all { it.jsonObject.keys == setOf("title", "status", "agent", "result") })
        assertTrue(ctx["messages"]!!.jsonArray.size <= 15)
    }
}
