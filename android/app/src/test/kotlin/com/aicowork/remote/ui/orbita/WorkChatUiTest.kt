package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.aicowork.remote.data.model.Author
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.TaskWork
import com.aicowork.remote.data.model.TraceEntry
import com.aicowork.remote.data.model.WorkTotals
import com.aicowork.remote.data.model.WorkToolRef
import com.aicowork.remote.data.model.WorkFile
import com.aicowork.remote.data.model.WorkStep
import com.aicowork.remote.ui.FakeController
import com.aicowork.remote.ui.SampleData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** En el chat, cada agente cuenta en corto qué hace; con la flecha, todo lo que hizo y, en cada herramienta, su detalle. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34], qualifiers = "w704dp-h933dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WorkChatUiTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun theTaskMessageTellsWhatTheAgentDoesAndEndsWithItsResult() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val task = snap.tasks.first()
        val work = ChatMessage(
            "w1",
            author = Author("agent", task.agentId),
            text = "",
            createdAt = 9,
            work = TaskWork(
                task.id,
                "Arreglar el formulario",
                "running",
                listOf(
                    WorkStep("note", text = "Reviso cómo valida el formulario."),
                    WorkStep(
                        "tools",
                        summary = "Ejecutó un comando y leyó un archivo",
                        items = listOf("Leyendo src/form.ts", "Ejecutando: npm test"),
                        failed = 1,
                        refs = listOf(WorkToolRef("1-1", "read", true), WorkToolRef("1-2", "command", false)),
                    ),
                ),
                totals = WorkTotals("Ejecutó 2 comandos y leyó un archivo", failed = 1, add = 3, del = 1),
            ),
        )
        val running = snap.copy(
            conversation = snap.conversation.copy(messages = snap.conversation.messages + work),
            tasks = snap.tasks.map {
                if (it.id == task.id) {
                    it.copy(
                        status = "running",
                        lastActivity = "Editando src/form.ts",
                        trace = listOf(TraceEntry("1-2", kind = "tool", tool = "command", title = "Ejecutando: npm test", body = "npm test", output = "1 failed: email", ok = false)),
                    )
                } else it
            },
        )
        val controller = FakeController(base.copy(snapshot = running))
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag("work-w1"))
        compose.onNodeWithText("Arreglar el formulario").assertIsDisplayed()
        compose.onNodeWithText(" · Trabajando").assertExists()
        // Nivel 1: en corto qué hace y el resumen de lo hecho, plegado.
        compose.onNodeWithText("Reviso cómo valida el formulario.").assertExists()
        compose.onNodeWithText("Ejecutó 2 comandos y leyó un archivo").assertExists()
        compose.onNodeWithText(" · 1 con error").assertExists()
        compose.onNodeWithText("Editando src/form.ts").assertExists()
        compose.onNodeWithText("Ejecutó un comando y leyó un archivo").assertDoesNotExist()
        compose.onNodeWithText("Ejecutando: npm test").assertDoesNotExist()
        // Nivel 2: con la flecha, todo lo que cuenta y cada grupo de herramientas en una línea.
        compose.onNodeWithTag("work-more-w1").performClick()
        compose.onNodeWithText("Ejecutó un comando y leyó un archivo").assertExists()
        compose.onNodeWithText("Ejecutando: npm test").assertDoesNotExist()
        compose.onNodeWithTag("tools-w1-1").performClick()
        compose.onNodeWithText("Ejecutando: npm test").assertExists()
        // Nivel 3: cada herramienta, con su detalle (se pide al registro de la tarea).
        compose.onNodeWithTag("tool-w1-1-1").performClick()
        compose.waitUntil(5_000) { "trace:${task.id}" in controller.calls }
        compose.waitUntil(5_000) { compose.onAllNodesWithText("1 failed: email").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("$ npm test").assertExists()

        // Al acabar, su resultado va en el mismo mensaje.
        val done = running.copy(
            conversation = running.conversation.copy(messages = running.conversation.messages.map { if (it.id == "w1") it.copy(text = "Listo: ya valida el correo.", work = it.work!!.copy(status = "done")) else it }),
            tasks = running.tasks.map { if (it.id == task.id) it.copy(status = "done") else it },
        )
        controller.state.value = base.copy(snapshot = done)
        compose.waitForIdle()
        compose.onNodeWithText(" · Hecha").assertExists()
        compose.onNodeWithText("Listo: ya valida el correo.").assertExists()
        compose.onNodeWithText("Editando src/form.ts").assertDoesNotExist()

        // Lo desplegado abre la actividad completa de la tarea.
        compose.onNodeWithTag("work-full-w1").performClick()
        assertEquals(task.id, model.traceTaskId)
    }

    @Test
    fun theFilesTheAgentCreatesShowUpWhileItWorks() {
        val base = SampleData.state()
        val snap = base.snapshot!!
        val task = snap.tasks.first()
        val shot = "artifacts/capturas/01-menu.png"
        val work = ChatMessage(
            "w2",
            author = Author("agent", task.agentId),
            text = "",
            createdAt = 9,
            work = TaskWork(
                task.id,
                "Montar el menú",
                "running",
                listOf(
                    WorkStep("note", text = "Ya tengo la primera pantalla."),
                    WorkStep("files", files = listOf(WorkFile(shot, "01-menu.png", image = true, size = 52_000), WorkFile("artifacts/informe.md", "informe.md", image = false, size = 4_000))),
                ),
            ),
        )
        val running = snap.copy(
            conversation = snap.conversation.copy(messages = snap.conversation.messages + work),
            tasks = snap.tasks.map { if (it.id == task.id) it.copy(status = "running") else it },
        )
        val controller = FakeController(base.copy(snapshot = running))
        val model = orbitaModelForTests(controller)
        compose.setContent { Box(Modifier.fillMaxSize()) { OrbitaApp(model, "Pixel", null) } }
        compose.onNodeWithTag("nav-Chat").performClick()
        compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag("work-w2"))
        compose.onNodeWithText("Ya tengo la primera pantalla.").assertExists()
        // La captura se pide al ordenador (no hace falta esperar a que acabe la tarea)…
        compose.waitUntil(5_000) { "file:project:$shot" in controller.calls }
        assertTrue(controller.calls.count { it == "file:project:$shot" } == 1)
        // …y el documento sale como una fila que se abre en el visor.
        compose.onNodeWithText("informe.md").performClick()
        assertEquals(ViewerTarget.File("project", "artifacts/informe.md", "informe.md", "markdown"), model.viewer)
    }
}
