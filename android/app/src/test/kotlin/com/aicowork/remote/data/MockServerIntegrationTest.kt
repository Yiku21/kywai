package com.aicowork.remote.data

import com.aicowork.mock.MockCoworkServer
import com.aicowork.remote.data.net.ApiException
import com.aicowork.remote.data.net.CoworkApiClient
import com.aicowork.remote.data.net.ProbeResult
import com.aicowork.remote.data.store.InMemorySessionStore
import com.aicowork.remote.data.store.InMemorySnapshotCache
import com.aicowork.remote.data.store.InMemoryTokenStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** El cliente y el repositorio reales contra el servidor simulado contractual (HTTP y HTTPS con certificado propio). */
class MockServerIntegrationTest {
    private val servers = mutableListOf<MockCoworkServer>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val tokens = InMemoryTokenStore()
    private val sessions = InMemorySessionStore()
    private val cache = InMemorySnapshotCache()

    private fun server(tls: Boolean = false): MockCoworkServer {
        val held = if (tls) MockCoworkServer.selfSigned(listOf("localhost", "127.0.0.1")) else null
        return MockCoworkServer(tickMillis = 25, heldCertificate = held).also { it.start(); servers += it }
    }

    private fun repository() = CoworkRepository(sessions, tokens, cache, scope, backoff = { 60L })

    @After
    fun tearDown() {
        scope.cancel()
        servers.forEach { it.close() }
    }

    private suspend fun CoworkRepository.awaitState(timeout: Long = 8_000, predicate: (CoworkUiState) -> Boolean): CoworkUiState =
        withTimeout(timeout) { state.first(predicate) }

    @Test
    fun `self-signed certificate requires the confirmed fingerprint`() = runBlocking<Unit> {
        val mock = server(tls = true)
        val url = mock.baseUrl.toHttpUrl()
        val unpinned = CoworkApiClient(url, null, { null }).probe()
        assertTrue("Sin huella confirmada no debe conectar: $unpinned", unpinned is ProbeResult.NeedsConfirmation)
        assertEquals(mock.certificateSha256, (unpinned as ProbeResult.NeedsConfirmation).certificate.sha256)

        val wrong = CoworkApiClient(url, "00:11:22", { null }).probe()
        assertTrue(wrong is ProbeResult.NeedsConfirmation)

        assertEquals(ProbeResult.Reachable, CoworkApiClient(url, mock.certificateSha256, { null }).probe())
        val paired = CoworkApiClient(url, mock.certificateSha256, { null }).pair(mock.pairingCode, "Pixel de prueba")
        assertTrue(paired.accessToken.isNotBlank())
        assertEquals("kywai (simulado)", paired.serverName)
    }

    @Test
    fun `pairing errors use the contract error body`() = runBlocking<Unit> {
        val mock = server()
        try {
            CoworkApiClient(mock.baseUrl.toHttpUrl(), null, { null }).pair("000000", "Pixel")
            fail("Debía fallar")
        } catch (e: ApiException) {
            assertEquals(401, e.status)
            assertEquals("invalid_code", e.code)
            assertEquals(false, e.retryable)
        }
        try {
            CoworkApiClient(mock.baseUrl.toHttpUrl(), null, { "falso" }).snapshot()
            fail("Debía fallar")
        } catch (e: ApiException) {
            assertTrue(e.isUnauthorized)
        }
    }

    @Test
    fun `pair, go online, send a request and follow it to the end over WebSocket`() = runBlocking<Unit> {
        val mock = server(tls = true)
        val repo = repository()
        repo.pair(mock.baseUrl.toHttpUrl(), mock.pairingCode, "Pixel", mock.certificateSha256)
        assertNotNull(tokens.read())
        assertEquals(mock.certificateSha256, sessions.load()?.pinnedSha256)

        val online = repo.awaitState { it.connection == Connection.Online && it.snapshot != null }
        assertEquals(4, online.snapshot!!.agents.size)

        repo.sendMessage("Prepara la demo")
        val done = repo.awaitState(15_000) { s ->
            val snap = s.snapshot ?: return@awaitState false
            s.outgoing.isEmpty() &&
                snap.conversation.messages.any { it.text == "Petición terminada." } &&
                snap.conversation.activeRequestIds.isEmpty()
        }
        val snap = done.snapshot!!
        val userMessage = snap.conversation.messages.first { it.author.isUser }
        assertEquals("Prepara la demo", userMessage.text)
        val tasks = snap.tasks.filter { it.requestId == userMessage.requestId }
        assertEquals(2, tasks.size)
        assertTrue(tasks.all { it.status == "done" })
        assertTrue(tasks.first().trace.isNotEmpty())
        val planner = snap.conversation.messages.first { it.author.agentId == "coordinador" }
        assertTrue(planner.text.startsWith("Entendido. Reparto"))
        assertEquals(false, planner.streaming)
        assertTrue(snap.memory.size >= 4)
    }

    @Test
    fun `stop and resume a running request`() = runBlocking<Unit> {
        val mock = server()
        val repo = repository()
        repo.pair(mock.baseUrl.toHttpUrl(), mock.pairingCode, "Pixel", null)
        repo.awaitState { it.connection == Connection.Online }
        repo.sendMessage("Algo largo")
        val running = repo.awaitState { it.snapshot?.tasks?.any { t -> t.status == "running" } == true }
        val requestId = running.snapshot!!.conversation.activeRequestIds.single()

        val stopped = repo.stopRequest(requestId)
        assertTrue(stopped.message, stopped.ok)
        repo.awaitState { s -> s.snapshot!!.conversation.activeRequestIds.isEmpty() && s.snapshot.tasks.any { it.status == "cancelled" } }

        val again = repo.stopRequest(requestId)
        assertEquals(false, again.ok)

        assertTrue(repo.resumeRequest(requestId).ok)
        repo.awaitState(15_000) { s -> s.snapshot!!.tasks.filter { it.requestId == requestId }.let { it.size == 2 && it.all { t -> t.status == "done" } } }
    }

    @Test
    fun `reconnects after a drop and delivers messages queued while offline`() = runBlocking<Unit> {
        val mock = server()
        val repo = CoworkRepository(sessions, tokens, cache, scope, backoff = { 400L })
        repo.pair(mock.baseUrl.toHttpUrl(), mock.pairingCode, "Pixel", null)
        repo.awaitState { it.connection == Connection.Online }

        mock.dropConnections()
        repo.awaitState { it.connection is Connection.Offline }
        repo.sendMessage("Escrito sin conexión")
        assertEquals(OutgoingStatus.Queued, repo.state.value.outgoing.single().status)

        repo.awaitState { s -> s.connection == Connection.Online && s.outgoing.isEmpty() }
        repo.awaitState { s -> s.snapshot!!.conversation.messages.any { it.text == "Escrito sin conexión" } }
    }

    @Test
    fun `revoked token sends the user back to pairing with a notice`() = runBlocking<Unit> {
        val mock = server()
        val repo = repository()
        repo.pair(mock.baseUrl.toHttpUrl(), mock.pairingCode, "Pixel", null)
        repo.awaitState { it.connection == Connection.Online }
        mock.revokeTokens()
        mock.dropConnections()
        val expired = repo.awaitState { it.session == null }
        assertNotNull(expired.notice)
        assertEquals(mock.baseUrl + "/", expired.previousSession?.serverUrl)
        assertNull(tokens.read())
    }

    @Test
    fun `new conversation replaces the chat and restarts from cache when reopened`() = runBlocking<Unit> {
        val mock = server()
        val repo = repository()
        repo.pair(mock.baseUrl.toHttpUrl(), mock.pairingCode, "Pixel", null)
        val first = repo.awaitState { it.connection == Connection.Online }.snapshot!!.conversation.id
        assertTrue(repo.newConversation().ok)
        val second = repo.awaitState { it.snapshot?.conversation?.id != first }.snapshot!!
        assertEquals(1, second.conversation.messages.size)

        withTimeout(5_000) { while (cache.load() == null) kotlinx.coroutines.delay(50) }
        repo.disconnect()
        val reopened = CoworkRepository(sessions, tokens, cache, scope, backoff = { 60L })
        assertTrue(reopened.state.value.fromCache)
        assertNotNull(reopened.state.value.snapshot)
        assertEquals(Connection.Idle, reopened.state.value.connection)
    }
    @Test
    fun `websocket expiration clears session and cache immediately`() = runBlocking<Unit> {
        val mock = server()
        val repo = repository()
        repo.pair(mock.baseUrl.toHttpUrl(), mock.pairingCode, "Pixel", null)
        val online = repo.awaitState { it.connection == Connection.Online }
        cache.save(online.snapshot!!, System.currentTimeMillis())
        mock.expireSessions()
        val expired = repo.awaitState { it.session == null }
        assertTrue(expired.notice!!.contains("caducó"))
        assertNull(tokens.read())
        assertNull(sessions.load())
        assertNull(cache.load())
    }

}
