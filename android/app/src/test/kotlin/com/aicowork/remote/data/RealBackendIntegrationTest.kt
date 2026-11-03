package com.aicowork.remote.data

import com.aicowork.remote.data.net.ApiException
import com.aicowork.remote.data.net.CoworkApiClient
import com.aicowork.remote.data.net.ProbeResult
import com.aicowork.remote.data.net.ServerUrl
import com.aicowork.remote.data.net.ServerUrlResult
import com.aicowork.remote.data.store.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Ejecutado por mobileApi.test.ts con servidor HTTP/HTTPS, almacén y orquestador reales. */
class RealBackendIntegrationTest {
    @Test
    fun androidClientAgainstRealServer() = runBlocking<Unit> {
        val address = System.getenv("AI_COWORK_TEST_URL")
        assumeTrue("Requiere el harness Node de integración", address != null)
        val url = (ServerUrl.parse(address!!) as ServerUrlResult.Valid).url
        val pin = System.getenv("AI_COWORK_TEST_PIN")!!
        val code = System.getenv("AI_COWORK_TEST_CODE")!!
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val tokens = InMemoryTokenStore()
        val sessions = InMemorySessionStore()
        val cache = InMemorySnapshotCache()
        val repo = CoworkRepository(sessions, tokens, cache, scope, backoff = { 50L })
        suspend fun await(predicate: (CoworkUiState) -> Boolean): CoworkUiState =
            withTimeout(15_000) { repo.state.first(predicate) }
        suspend fun probe(pinValue: String?): ProbeResult {
            val c = CoworkApiClient(url, pinValue, { null })
            return try { c.probe() } finally { c.shutdown() }
        }
        try {
            assertTrue(probe(null) is ProbeResult.NeedsConfirmation)
            assertTrue(probe("00:11") is ProbeResult.NeedsConfirmation)
            assertEquals(ProbeResult.Reachable, probe(pin))
            val invalid = CoworkApiClient(url, pin, { null })
            try {
                invalid.pair("incorrecto", "Android")
                fail("Debe rechazar el código")
            } catch (e: ApiException) {
                assertEquals("INVALID_PAIRING_CODE", e.code)
                assertFalse(e.retryable)
            } finally { invalid.shutdown() }
            repo.pair(url, code, "Android integración", pin)
            val initial = await { it.connection == Connection.Online }.snapshot!!
            assertTrue(initial.agents.any { it.id == "codex" })
            assertTrue(initial.memory.any { it.text == "Memoria real de integración" })
            assertNotNull(sessions.load()?.expiresAt)
            assertNotNull(tokens.read())
            repo.sendMessage("Trabajo de integración Android")
            val working = await { s -> s.outgoing.isEmpty() && s.snapshot?.tasks?.any { it.status == "running" } == true }.snapshot!!
            val request = working.tasks.first { it.status == "running" }.requestId!!
            assertTrue(working.conversation.messages.any { it.author.isUser && it.clientMessageId != null })
            await { it.snapshot?.agents?.any { a -> a.activity == "working" || a.activity == "thinking" } == true }
            assertTrue(repo.stopRequest(request).ok)
            await { it.snapshot?.tasks?.any { t -> t.requestId == request && t.status == "cancelled" } == true }
            assertTrue(repo.resumeRequest(request).ok)
            await { it.snapshot?.tasks?.any { t -> t.requestId == request && t.status == "running" } == true }
            val done = await { it.snapshot?.tasks?.any { t -> t.requestId == request && t.status == "done" } == true }.snapshot!!
            assertTrue(done.tasks.first { it.requestId == request }.trace.isNotEmpty())
            await { (it.snapshot?.usage?.totals?.total ?: 0) > 0 }
            await { it.snapshot?.memory?.any { m -> m.text == "Memoria recibida en vivo" } == true }
            repo.disconnect()
            assertEquals(Connection.Idle, repo.state.value.connection)
            repo.connect()
            val reconnected = await { it.connection == Connection.Online }.snapshot!!
            assertTrue(reconnected.tasks.first { it.requestId == request }.trace.isNotEmpty())
            assertTrue(repo.newConversation().ok)
            val fresh = repo.state.value.snapshot!!
            assertNotEquals(initial.conversation.id, fresh.conversation.id)
            assertTrue(fresh.tasks.isEmpty())
            assertTrue(fresh.memory.isEmpty())
            assertTrue(fresh.conversation.messages.isEmpty())
            // Un 401 real elimina la credencial y obliga a volver a emparejar.
            tokens.write("token-invalido")
            repo.refresh()
            await { it.session == null && it.notice != null }
            assertNull(tokens.read())
            assertNull(sessions.load())
            assertNull(cache.load())
        } finally {
            repo.forget()
            scope.cancel()
        }
    }

    @Test
    fun pairedPhoneStaysPairedPastItsDate() {
        // Un móvil emparejado no caduca: aunque pase la fecha guardada, al abrir la app sigue emparejado.
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val tokens = InMemoryTokenStore("token")
        val sessions = InMemorySessionStore(Session("https://100.64.1.2:8788", "Servidor", "Android", expiresAt = 100))
        try {
            val repo = CoworkRepository(sessions, tokens, InMemorySnapshotCache(), scope, now = { 1_000L })
            assertNotNull(repo.state.value.session)
            assertNull(repo.state.value.notice)
            assertEquals("token", tokens.read())
        } finally { scope.cancel() }
    }
}
