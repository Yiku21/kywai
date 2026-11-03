package com.aicowork.remote.ui.orbita

import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.Author
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Reglas de Órbita que no dependen de la pantalla. */
class OrbitaRulesTest {
    private val hermes = Agent("hermes", "Hermes", provider = "hermes", plannerOnly = true)
    private val codex = Agent("codex", "Codex", provider = "codex")

    private fun snapshot(messages: List<ChatMessage> = emptyList(), tasks: List<TaskItem> = emptyList(), active: List<String> = emptyList()) =
        Snapshot(conversation = Conversation("p1", messages = messages, activeRequestIds = active), agents = listOf(hermes, codex), tasks = tasks)

    @Test
    fun hermesNeedsYouForAQuestionAPauseOrAFailure() {
        val question = snapshot(listOf(ChatMessage("1", author = Author("user"), text = "Haz la web"), ChatMessage("2", author = Author("agent", "hermes"), text = "¿Para móvil o escritorio?")))
        assertEquals("Hermes te ha hecho una pregunta", OrbitaModel.attentionOf(question)?.reason)
        // Ya respondida: no.
        val answered = snapshot(question.conversation.messages + ChatMessage("3", author = Author("user"), text = "Móvil"))
        assertNull(OrbitaModel.attentionOf(answered))

        val paused = snapshot(tasks = listOf(TaskItem("t", "r1", title = "Portada", status = "cancelled", error = TaskItem.INTERRUPTED_ERROR, agentId = "codex")))
        assertEquals(Attention("hermes", "En pausa: «Portada»", "t", "Trabajo en pausa"), OrbitaModel.attentionOf(paused))
        // Varias: las cuenta y lleva a la más reciente.
        val two = snapshot(tasks = paused.tasks + TaskItem("t2", "r0", title = "Logo", status = "cancelled", error = TaskItem.INTERRUPTED_ERROR, agentId = "codex", createdAt = 9))
        assertEquals(Attention("hermes", "2 tareas en pausa: revísalas", "t2", "Trabajo en pausa"), OrbitaModel.attentionOf(two))
        // Quitada (cancelada por el usuario): ya no avisa.
        assertNull(OrbitaModel.attentionOf(snapshot(tasks = listOf(paused.tasks[0].copy(error = "Cancelada por el usuario")))))
        // Si la petición ya se reanudó (está activa), no.
        assertNull(OrbitaModel.attentionOf(paused.copy(conversation = paused.conversation.copy(activeRequestIds = listOf("r1")))))

        val failed = snapshot(tasks = listOf(TaskItem("t", "r2", status = "failed", agentId = "codex", createdAt = 5)))
        assertEquals(Attention("hermes", "Una tarea falló: revísala", "t", "Una tarea falló"), OrbitaModel.attentionOf(failed))
        assertNull(OrbitaModel.attentionOf(snapshot()))
    }

    @Test
    fun aPlanWaitingForYourApprovalNeedsYouUntilYouDecide() {
        val plan = com.aicowork.remote.data.model.PlanProposal("pending", listOf(com.aicowork.remote.data.model.ProposedTask("t1", "Web", agentId = "codex")), "Haz la web")
        val waiting = snapshot(listOf(ChatMessage("1", author = Author("user"), text = "Haz la web"), ChatMessage("2", author = Author("agent", "hermes"), text = "Codex hace la web.", proposal = plan)))
        assertEquals(Attention("hermes", "Hermes espera tu visto bueno al plan"), OrbitaModel.attentionOf(waiting))
        val approved = snapshot(listOf(waiting.conversation.messages[0], waiting.conversation.messages[1].copy(proposal = plan.copy(status = "approved"))))
        assertNull(OrbitaModel.attentionOf(approved))
    }

    @Test
    fun deliverablesGoTogetherInTheirCommonFolder() {
        val shots = listOf("artifacts/mobile-app-concepts/01-bienvenida.png", "artifacts/mobile-app-concepts/02-inicio.png", "artifacts/mobile-app-concepts/web/index.html")
        assertEquals("artifacts/mobile-app-concepts", Deliverables.commonFolder(shots))
        assertEquals("mobile-app-concepts", Deliverables.folderName(Deliverables.commonFolder(shots)))
        assertEquals("artifacts", Deliverables.commonFolder(listOf("artifacts\\a.md", "artifacts\\b.md")))
        assertEquals("", Deliverables.commonFolder(listOf("README.md", "src/app.ts")))
        assertEquals("Entregables", Deliverables.folderName(""))
        assertEquals("3 imágenes y 1 página", Deliverables.kindsSummary(listOf("image", "image", "html", "image")))
        assertEquals("2 archivos de código, 1 texto y 1 imagen", Deliverables.kindsSummary(listOf("code", "code", "text", "image")))
        // Si no añade nada al número de archivos, nada.
        assertEquals("", Deliverables.kindsSummary(listOf("image", "html", "code", "markdown", "other")))
        assertEquals("3 archivos · 2 imágenes y 1 página · por Codex", Deliverables.folderSummary(listOf("image", "image", "html"), listOf("Codex")))
        assertEquals("4 archivos · por Codex y Claude", Deliverables.folderSummary(listOf("image", "html", "code", "markdown"), listOf("Codex", "Claude")))
    }

    @Test
    fun tasksAreFiledInProgressToReviewOrDone() {
        val active = emptySet<String>()
        assertEquals(TaskFilter.Active, taskFilterOf(TaskItem("a", status = "running"), active))
        assertEquals(TaskFilter.Active, taskFilterOf(TaskItem("b", status = "blocked"), active))
        assertEquals(TaskFilter.Review, taskFilterOf(TaskItem("c", status = "failed"), active))
        assertEquals(TaskFilter.Review, taskFilterOf(TaskItem("d", "r", status = "cancelled", error = TaskItem.INTERRUPTED_ERROR), active))
        assertEquals(TaskFilter.Review, taskFilterOf(TaskItem("e", status = "done", outOfScope = listOf("otro.kt")), active))
        assertEquals(TaskFilter.Done, taskFilterOf(TaskItem("f", status = "done"), active))
        assertEquals(TaskFilter.Done, taskFilterOf(TaskItem("g", status = "cancelled", error = "Cancelada por el usuario"), active))
    }

    @Test
    fun markdownKeepsCodeAndLinksReadable() {
        assertEquals("negrita y código y enlace", inline("**negrita** y `código` y [enlace](https://x)").text)
    }
}
