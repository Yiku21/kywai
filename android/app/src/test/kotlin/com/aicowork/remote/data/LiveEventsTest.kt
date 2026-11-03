package com.aicowork.remote.data

import com.aicowork.remote.data.model.Author
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Qué actividad en directo sale de cada evento (lo que anima el mundo, suena y avisa). */
class LiveEventsTest {
    private val before = Snapshot(
        conversation = Conversation("p1", messages = listOf(ChatMessage("m1", author = Author("user"), text = "Hola")), activeRequestIds = listOf("r1")),
        tasks = listOf(TaskItem("t1", "r1", "Diseñar", agentId = "claude", status = "pending")),
    )

    private fun event(json: String) = EventReducer.parse(json)!!

    private fun apply(json: String): Pair<Snapshot, List<LiveEvent>> {
        val envelope = event(json)
        val after = (EventReducer.reduce(before, null, envelope) as? ReduceResult.Applied)?.snapshot ?: before
        return after to LiveEvents.of(envelope, before, after)
    }

    @Test
    fun transfersAndCompletionsAreLive() {
        val (_, transfer) = apply("""{"type":"transfer.started","sequence":1,"payload":{"transfer":{"id":"x","fromId":"core","toId":"claude","label":"Nueva tarea","payload":{"title":"Diseñar"}}}}""")
        val t = transfer.single() as LiveEvent.Transfer
        assertEquals("core", t.info.fromId)
        assertEquals("Diseñar", t.info.payload.title)

        val (_, done) = apply("""{"type":"task.completed","sequence":2,"payload":{"taskId":"t1","agentId":"claude"}}""")
        assertEquals(LiveEvent.TaskCompleted("t1", "claude", "Diseñar"), done.single())
    }

    @Test
    fun aTaskThatStartsOrFailsIsLiveButARepeatIsNot() {
        val (_, started) = apply("""{"type":"task.upsert","sequence":3,"payload":{"task":{"id":"t1","runId":"r1","title":"Diseñar","agentId":"claude","status":"running"}}}""")
        assertTrue(started.single() is LiveEvent.TaskStarted)
        val (_, failed) = apply("""{"type":"task.upsert","sequence":3,"payload":{"task":{"id":"t1","runId":"r1","title":"Diseñar","agentId":"claude","status":"failed","error":"No compila"}}}""")
        assertEquals("No compila", (failed.single() as LiveEvent.TaskFailed).task.error)
        val (_, same) = apply("""{"type":"task.upsert","sequence":3,"payload":{"task":{"id":"t1","runId":"r1","title":"Diseñar","agentId":"claude","status":"pending"}}}""")
        assertTrue(same.isEmpty())
    }

    @Test
    fun onlyNewAgentMessagesAndResultsAreLive() {
        val (_, agent) = apply("""{"type":"message.upsert","sequence":4,"payload":{"message":{"id":"m2","projectId":"p1","author":{"type":"agent","agentId":"hermes"},"text":"Plan listo"}}}""")
        assertEquals("Plan listo", agent.filterIsInstance<LiveEvent.AgentMessage>().single().message.text)
        // Y suena con la voz de Hermes.
        assertEquals(LiveEvent.AgentSpoke("hermes", "m2", listOf(Said("Plan listo")), false), agent.filterIsInstance<LiveEvent.AgentSpoke>().single())
        val (_, again) = apply("""{"type":"message.upsert","sequence":4,"payload":{"message":{"id":"m1","projectId":"p1","author":{"type":"user"},"text":"Hola"}}}""")
        assertTrue(again.isEmpty())
        val (after, result) = apply("""{"type":"artifact.created","sequence":5,"payload":{"artifact":{"id":"a1","projectId":"p1","name":"web.html","relPath":"web.html","kind":"html","size":10,"createdAt":1}}}""")
        assertEquals("web.html", (result.single() as LiveEvent.ArtifactCreated).artifact.name)
        assertEquals(1, after.conversation.artifacts.size)
    }

    @Test
    fun eachNewSentenceOfATaskSoundsOnceAndTheResultDoesNotRepeatIt() {
        val now = System.currentTimeMillis()
        fun work(seq: Int, text: String, status: String, vararg notes: String): String {
            val steps = notes.joinToString(",") { """{"kind":"note","text":"$it"}""" }
            return """{"type":"message.upsert","sequence":$seq,"payload":{"message":{"id":"w1","projectId":"p1","author":{"type":"agent","agentId":"codex"},"text":"$text","createdAt":$now,"work":{"taskId":"t1","title":"Diseñar","status":"$status","steps":[$steps]}}}}"""
        }
        fun next(from: Snapshot, json: String): Pair<Snapshot, List<LiveEvent>> {
            val envelope = event(json)
            val after = (EventReducer.reduce(from, null, envelope) as? ReduceResult.Applied)?.snapshot ?: from
            return after to LiveEvents.of(envelope, from, after)
        }
        // Empieza: aún no dice nada.
        val (s1, started) = next(before, work(10, "", "running"))
        assertTrue(started.none { it is LiveEvent.AgentSpoke })
        val (s2, first) = next(s1, work(11, "", "running", "Reviso el formulario."))
        assertEquals(listOf(LiveEvent.AgentSpoke("codex", "w1", listOf(Said("Reviso el formulario.", note = true)), false)), first)
        val (s3, second) = next(s2, work(12, "", "running", "Reviso el formulario.", "Falla el correo: lo arreglo."))
        assertEquals(listOf(LiveEvent.AgentSpoke("codex", "w1", listOf(Said("Falla el correo: lo arreglo.", note = true)), false)), second)
        // Al acabar, su texto es la última frase (ya sonó): no se repite.
        val (_, done) = next(s3, work(13, "Falla el correo: lo arreglo.", "done", "Reviso el formulario."))
        assertTrue(done.none { it is LiveEvent.AgentSpoke })
    }

    @Test
    fun anOldMessageThatArrivesAgainIsNotSpoken() {
        val (_, old) = apply("""{"type":"message.upsert","sequence":9,"payload":{"message":{"id":"m7","projectId":"p1","author":{"type":"agent","agentId":"claude"},"text":"Antiguo","createdAt":1000}}}""")
        assertTrue(old.none { it is LiveEvent.AgentSpoke })
    }

    @Test
    fun finishedRequestsOnlyIfTheyWereActive() {
        val (_, ok) = apply("""{"type":"run.finished","sequence":6,"payload":{"runId":"r1","projectId":"p1","ok":false}}""")
        assertEquals(LiveEvent.RequestFinished("r1", false), ok.single())
        val (_, other) = apply("""{"type":"run.finished","sequence":6,"payload":{"runId":"r9","projectId":"p1","ok":true}}""")
        assertTrue(other.isEmpty())
    }

    @Test
    fun attachmentsAndInstructionsUpdateTheOpenProject() {
        val (withFiles, _) = apply("""{"type":"attachments.updated","sequence":7,"payload":{"projectId":"p1","attachments":[{"id":"f1","name":"brief.pdf","relPath":"attachments/brief.pdf","mime":"application/pdf","size":5}]}}""")
        assertEquals("brief.pdf", withFiles.conversation.attachments.single().name)
        val (other, _) = apply("""{"type":"attachments.updated","sequence":7,"payload":{"projectId":"p2","attachments":[{"id":"f1","name":"x","relPath":"attachments/x","mime":"","size":1}]}}""")
        assertTrue(other.conversation.attachments.isEmpty())
        val (withInstructions, _) = apply("""{"type":"memory.updated","sequence":8,"payload":{"projectId":"p1","memory":[],"instructions":"Sin neón"}}""")
        assertEquals("Sin neón", withInstructions.conversation.instructions)
    }
}
