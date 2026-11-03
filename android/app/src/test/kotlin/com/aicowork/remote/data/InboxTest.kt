package com.aicowork.remote.data

import com.aicowork.remote.data.model.Capabilities
import com.aicowork.remote.data.model.CoworkJson
import com.aicowork.remote.data.model.InboxActionResponse
import com.aicowork.remote.data.model.InboxResponse
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.net.CoworkApiClient
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** La bandeja «Te necesita»: modelos tolerantes y peticiones como pide el contrato. */
class InboxTest {
    private val server = MockWebServer().apply { start() }
    private val client = CoworkApiClient(server.url("/"), null, { "tok" })

    @After
    fun tearDown() {
        client.shutdown()
        server.shutdown()
    }

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    @Test
    fun `parses inbox items with every kind of field and ignores unknown ones`() {
        val body = """
            {"items":[
              {"id":"i1","kind":"mac-permission","title":"El Mac pide permiso","detail":"Accesibilidad","projectId":"p1",
               "runId":"r1","taskId":"t1","messageId":"m1","agentId":"claude","key":"perm:ax",
               "actions":[{"id":"screen","label":"Compartir pantalla","url":"vnc://mac.local"},{"id":"done","label":"Hecho"}],
               "createdAt":1760000000000,"nuevo":true},
              {"id":"i2","kind":"done","title":"Terminado","actions":[],"createdAt":"2026-10-11T10:00:00Z",
               "resolvedAt":1760000005000,"resolution":"dismiss"}
            ]}
        """.trimIndent()
        val items = CoworkJson.decodeFromString(InboxResponse.serializer(), body).items
        assertEquals(2, items.size)
        val open = items[0]
        assertTrue(open.isOpen)
        assertEquals("mac-permission", open.kind)
        assertEquals("p1", open.projectId)
        assertEquals("vnc://mac.local", open.actions[0].url)
        assertNull(open.actions[1].url)
        assertEquals(1_760_000_000_000L, open.createdAt)
        val closed = items[1]
        assertFalse(closed.isOpen)
        assertEquals("dismiss", closed.resolution)
        assertEquals(1_791_712_800_000L, closed.createdAt)
    }

    @Test
    fun `old servers have no inbox capability`() {
        val snapshot = CoworkJson.decodeFromString(Snapshot.serializer(), """{"capabilities":{"stopRequests":true}}""")
        assertFalse(snapshot.capabilities.inbox)
        assertTrue(Capabilities(inbox = true).inbox)
    }

    @Test
    fun `action response carries the resolved item and the server message`() {
        val r = CoworkJson.decodeFromString(
            InboxActionResponse.serializer(),
            """{"item":{"id":"i1","kind":"plan","title":"Plan","actions":[],"createdAt":1,"resolvedAt":2,"resolution":"approve"},"message":"Plan aprobado"}""",
        )
        assertEquals("Plan aprobado", r.message)
        assertFalse(r.item!!.isOpen)
    }

    @Test
    fun `inbox requests use the contract paths`() = runBlocking {
        server.enqueue(json("""{"items":[{"id":"i 1","kind":"question","title":"¿Seguimos?","actions":[{"id":"yes","label":"Sí"}],"createdAt":5}]}"""))
        val items = client.inbox()
        assertEquals("i 1", items.single().id)
        val list = server.takeRequest()
        assertEquals("GET", list.method)
        assertEquals("/api/mobile/v1/inbox", list.requestUrl!!.encodedPath)
        assertEquals("Bearer tok", list.getHeader("Authorization"))

        server.enqueue(json("""{"item":{"id":"i 1","kind":"question","title":"¿Seguimos?","actions":[],"createdAt":5,"resolvedAt":6},"message":"Respondido"}"""))
        val response = client.inboxAction("i 1", "yes")
        assertEquals("Respondido", response.message)
        val action = server.takeRequest()
        assertEquals("POST", action.method)
        assertEquals("/api/mobile/v1/inbox/i%201/yes", action.requestUrl!!.encodedPath)
        assertEquals("{}", action.body.readUtf8())
    }

    @Test
    fun `inbox updated events are ignored by the snapshot reducer`() {
        val event = EventReducer.parse("""{"type":"inbox.updated","sequence":5,"payload":{"items":[{"id":"i1","title":"x","actions":[]}]}}""")!!
        assertEquals(ReduceResult.Ignored, EventReducer.reduce(Snapshot(), 4, event))
    }
}
