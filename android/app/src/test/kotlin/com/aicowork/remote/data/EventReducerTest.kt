package com.aicowork.remote.data

import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.data.model.ChatMessage
import com.aicowork.remote.data.model.Conversation
import com.aicowork.remote.data.model.CoworkJson
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.TaskItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EventReducerTest {

    private val base = Snapshot(
        conversation = Conversation(id = "c1", messages = listOf(ChatMessage(id = "m1", text = "Hola"))),
        agents = listOf(Agent(id = "a1", name = "Constructor")),
        tasks = listOf(TaskItem(id = "t1", requestId = "r1", title = "Construir")),
    )

    private fun reduce(json: String, last: Long? = 4, snapshot: Snapshot = base): ReduceResult =
        EventReducer.reduce(snapshot, last, EventReducer.parse(json)!!)

    private fun applied(json: String, last: Long? = 4): Snapshot {
        val result = reduce(json, last)
        assertTrue("Se esperaba Applied y llegó $result", result is ReduceResult.Applied)
        return (result as ReduceResult.Applied).snapshot
    }

    @Test
    fun `parses snapshot with ISO and millisecond timestamps and unknown fields`() {
        val json = """
            {"conversation":{"id":"c9","messages":[{"id":"m","author":{"type":"user"},"text":"x","createdAt":"2026-10-11T10:00:00Z","extra":1}]},
             "agents":[{"id":"a","name":"A","lastActivityAt":1760000000000}],
             "tasks":[{"id":"t","runId":"r7","status":"running","progress":0.5}],
             "memory":[], "usage":{"totals":{"input":10,"output":5}}, "capabilities":{"stopRequests":false}, "nuevo":true}
        """.trimIndent()
        val snapshot = CoworkJson.decodeFromString(Snapshot.serializer(), json)
        assertEquals(1_791_712_800_000L, snapshot.conversation.messages.first().createdAt)
        assertEquals(1_760_000_000_000L, snapshot.agents.first().lastActivityAt)
        assertEquals("r7", snapshot.tasks.first().requestId)
        assertEquals(15L, snapshot.usage.totals.total)
        assertEquals(false, snapshot.capabilities.stopRequests)
    }

    @Test
    fun `message upsert adds and replaces by id`() {
        val added = applied("""{"type":"message.upsert","sequence":5,"payload":{"message":{"id":"m2","author":{"type":"agent","agentId":"a1"},"text":"Voy"}}}""")
        assertEquals(listOf("m1", "m2"), added.conversation.messages.map { it.id })
        val replaced = EventReducer.reduce(added, 5, EventReducer.parse("""{"type":"message.upsert","sequence":6,"payload":{"message":{"id":"m2","text":"Hecho"}}}""")!!)
        assertEquals("Hecho", (replaced as ReduceResult.Applied).snapshot.conversation.messages.last().text)
    }

    @Test
    fun `delta appends streamed text`() {
        val s = applied("""{"type":"message.delta","sequence":5,"payload":{"messageId":"m1","text":" mundo"}}""")
        assertEquals("Hola mundo", s.conversation.messages.first().text)
        assertTrue(s.conversation.messages.first().streaming)
    }

    @Test
    fun `delta for unknown message asks for resync`() {
        assertTrue(reduce("""{"type":"message.delta","sequence":5,"payload":{"messageId":"zz","text":"x"}}""") is ReduceResult.NeedsResync)
    }

    @Test
    fun `sequence gap asks for resync and duplicates are ignored`() {
        assertTrue(reduce("""{"type":"message.upsert","sequence":9,"payload":{"message":{"id":"m3"}}}""") is ReduceResult.NeedsResync)
        assertEquals(ReduceResult.Ignored, reduce("""{"type":"message.upsert","sequence":3,"payload":{"message":{"id":"m3"}}}"""))
        // Sin referencia (instantánea sin número) cualquier secuencia vale.
        assertTrue(reduce("""{"type":"message.upsert","sequence":90,"payload":{"message":{"id":"m3"}}}""", last = null) is ReduceResult.Applied)
    }

    @Test
    fun `agent runtime merges partial state`() {
        val s = applied("""{"type":"agent.runtime","sequence":5,"payload":{"runtime":{"agentId":"a1","activity":"working","taskId":"t1","lastActivity":"Editando app.kt"}}}""")
        val agent = s.agents.single()
        assertEquals("working", agent.activity)
        assertEquals("Constructor", agent.name)
        assertEquals("Editando app.kt", agent.lastActivity)
    }

    @Test
    fun `task upsert keeps trace and trace entries are appended`() {
        val traced = applied("""{"type":"task.trace","sequence":5,"payload":{"taskId":"t1","entry":{"id":"e1","kind":"tool","tool":"command","title":"npm test","ok":true}}}""")
        assertEquals(1, traced.tasks.single().trace.size)
        val updated = EventReducer.reduce(traced, 5, EventReducer.parse("""{"type":"task.upsert","sequence":6,"payload":{"task":{"id":"t1","requestId":"r1","title":"Construir","status":"done"}}}""")!!)
        val task = (updated as ReduceResult.Applied).snapshot.tasks.single()
        assertEquals("done", task.status)
        assertEquals("npm test", task.trace.single().title)
    }

    @Test
    fun `request lifecycle accepts run and request names`() {
        val started = applied("""{"type":"run.started","sequence":5,"payload":{"runId":"r1"}}""")
        assertEquals(listOf("r1"), started.conversation.activeRequestIds)
        val finished = EventReducer.reduce(started, 5, EventReducer.parse("""{"type":"request.finished","sequence":6,"payload":{"requestId":"r1","ok":false}}""")!!)
        assertTrue((finished as ReduceResult.Applied).snapshot.conversation.activeRequestIds.isEmpty())
    }

    @Test
    fun `memory usage and new conversation replace their sections`() {
        val memory = applied("""{"type":"memory.updated","sequence":5,"payload":{"memory":[{"id":"m1","kind":"decision","text":"Nativa","status":"confirmed"}]}}""")
        assertEquals("decision", memory.memory.single().kind)
        val usage = applied("""{"type":"usage.updated","sequence":5,"payload":{"usage":{"totals":{"input":1,"output":2},"quotas":[{"id":"q","remainingPct":40}]}}}""")
        assertEquals(40.0, usage.usage.quotas.single().remainingPct!!, 0.0)
        val conv = applied("""{"type":"conversation.created","sequence":5,"payload":{"conversation":{"id":"c2","messages":[]}}}""")
        assertEquals("c2", conv.conversation.id)
        assertTrue(conv.conversation.messages.isEmpty())
    }

    @Test
    fun `deleted current conversation resyncs while other deletions are ignored`() {
        assertTrue(reduce("""{"type":"project.deleted","sequence":5,"payload":{"projectId":"c1"}}""") is ReduceResult.NeedsResync)
        assertEquals(ReduceResult.Ignored, reduce("""{"type":"project.deleted","sequence":5,"payload":{"projectId":"c2"}}"""))
    }

    @Test
    fun `unknown events are ignored and malformed text is rejected`() {
        assertEquals(ReduceResult.Ignored, reduce("""{"type":"future.thing","sequence":5,"payload":{}}"""))
        assertEquals(null, EventReducer.parse("no es json"))
        assertNotNull(EventReducer.parse("""{"type":"hello"}"""))
    }

    @Test
    fun `events of other conversations are ignored, global ones are applied`() {
        val foreign = mutableSetOf<String>()
        val other = EventReducer.reduce(base, 4, EventReducer.parse("""{"type":"message.upsert","sequence":5,"payload":{"message":{"id":"x1","projectId":"otro","conversationId":"otro","text":"…"}}}""")!!, foreign)
        assertEquals(ReduceResult.Ignored, other)
        assertTrue("x1" in foreign)
        // Su texto en streaming tampoco obliga a sincronizar.
        assertEquals(ReduceResult.Ignored, EventReducer.reduce(base, 5, EventReducer.parse("""{"type":"message.delta","sequence":6,"payload":{"messageId":"x1","text":"más"}}""")!!, foreign))
        assertEquals(ReduceResult.Ignored, reduce("""{"type":"task.upsert","sequence":5,"payload":{"task":{"id":"t9","projectId":"otro"}}}"""))
        assertEquals(ReduceResult.Ignored, reduce("""{"type":"run.started","sequence":5,"payload":{"runId":"r9","projectId":"otro"}}"""))
        assertEquals(ReduceResult.Ignored, reduce("""{"type":"chat.cleared","sequence":5,"payload":{"projectId":"otro"}}"""))
        assertTrue(reduce("""{"type":"chat.cleared","sequence":5,"payload":{"projectId":"c1"}}""") is ReduceResult.NeedsResync)
        // Mensaje de esta conversación con los campos que envía AI Cowork (runId, projectId, conversationId).
        val mine = applied("""{"type":"message.upsert","sequence":5,"payload":{"id":"ev","ts":1,"message":{"id":"m9","projectId":"c1","conversationId":"c1","runId":"r1","author":{"type":"user"},"text":"Hola","createdAt":5}}}""")
        assertEquals("r1", mine.conversation.messages.last().requestId)
        // Los agentes son globales.
        assertTrue(reduce("""{"type":"agent.runtime","sequence":5,"payload":{"runtime":{"agentId":"a1","activity":"idle"}}}""") is ReduceResult.Applied)
    }
}
