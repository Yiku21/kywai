package com.aicowork.mock

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

/** Comprueba que el servidor simulado respeta las formas del contrato /api/mobile/v1. */
class MockContractTest {
    private val server = MockCoworkServer(tickMillis = 20).also { it.start() }
    private val http = OkHttpClient()
    private val json = "application/json".toMediaType()

    @After
    fun tearDown() = server.close()

    private fun call(method: String, path: String, body: String? = null, token: String? = null): Pair<Int, JsonObject> {
        val request = Request.Builder().url(server.baseUrl + "/api/mobile/v1" + path)
            .method(method, body?.toRequestBody(json))
            .apply { token?.let { header("Authorization", "Bearer $it") } }
            .build()
        http.newCall(request).execute().use { return it.code to Json.parseToJsonElement(it.body!!.string()).jsonObject }
    }

    private fun pair(): String {
        val (status, body) = call("POST", "/pair", """{"code":"${server.pairingCode}","deviceName":"Prueba"}""")
        assertEquals(200, status)
        Instant.parse(body["expiresAt"]!!.jsonPrimitive.content)
        assertTrue(body["serverName"]!!.jsonPrimitive.content.isNotBlank())
        return body["accessToken"]!!.jsonPrimitive.content
    }

    @Test
    fun errorsUseTheCommonEnvelope() {
        val (status, body) = call("GET", "/snapshot")
        assertEquals(401, status)
        assertEquals(setOf("code", "message", "retryable"), body.keys)
        assertEquals(false, body["retryable"]!!.jsonPrimitive.boolean)
        assertEquals(401, call("POST", "/pair", """{"code":"1","deviceName":"x"}""").first)
        assertEquals(404, call("POST", "/requests/nada/stop", "{}", pair()).first)
    }

    @Test
    fun snapshotHasEveryContractSection() {
        val (status, body) = call("GET", "/snapshot", token = pair())
        assertEquals(200, status)
        listOf("conversation", "agents", "tasks", "memory", "usage", "capabilities").forEach { assertTrue(it, it in body) }
        assertTrue(body["agents"]!!.jsonArray.isNotEmpty())
    }

    @Test
    fun inboxListsItemsAndResolvesThemWithAnAction() {
        val token = pair()
        val (status, body) = call("GET", "/inbox", token = token)
        assertEquals(200, status)
        val items = body["items"]!!.jsonArray
        assertTrue(items.isNotEmpty())
        val first = items.first().jsonObject
        val id = first["id"]!!.jsonPrimitive.content
        val action = first["actions"]!!.jsonArray.map { it.jsonObject }.first { "url" !in it }["id"]!!.jsonPrimitive.content
        val (done, result) = call("POST", "/inbox/$id/$action", "{}", token)
        assertEquals(200, done)
        assertTrue("resolvedAt" in result["item"]!!.jsonObject)
        assertTrue(result["message"]!!.jsonPrimitive.content.isNotBlank())
        assertEquals(404, call("POST", "/inbox/nada/$action", "{}", token).first)
        assertEquals(404, call("POST", "/inbox/$id/nada", "{}", token).first)
        assertEquals(true, call("GET", "/snapshot", token = token).second["capabilities"]!!.jsonObject["inbox"]!!.jsonPrimitive.boolean)
    }

    @Test
    fun eventsArriveAsSequencedEnvelopes() {
        val token = pair()
        val received = LinkedBlockingQueue<JsonObject>()
        val socket = http.newWebSocket(
            Request.Builder().url(server.baseUrl + "/api/mobile/v1/events").header("Authorization", "Bearer $token").build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    received += Json.parseToJsonElement(text).jsonObject
                }
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = Unit
            },
        )
        assertEquals("hello", received.poll(5, TimeUnit.SECONDS)!!["type"]!!.jsonPrimitive.content)
        val (status, sent) = call("POST", "/chat/messages", """{"conversationId":null,"text":"Hola","clientMessageId":"abc"}""", token)
        assertEquals(202, status)
        // Reenviar el mismo clientMessageId no duplica.
        val again = call("POST", "/chat/messages", """{"conversationId":null,"text":"Hola","clientMessageId":"abc"}""", token).second
        assertEquals(sent["message"]!!.jsonObject["id"], again["message"]!!.jsonObject["id"])

        var last = 0L
        val types = mutableListOf<String>()
        while (types.lastOrNull() != "request.finished") {
            val event = received.poll(10, TimeUnit.SECONDS) ?: error("No llegaron eventos: $types")
            assertEquals(setOf("type", "sequence", "payload"), event.keys)
            val sequence = event["sequence"]!!.jsonPrimitive.long
            assertEquals(last + 1, sequence)
            last = sequence
            types += event["type"]!!.jsonPrimitive.content
        }
        assertTrue(types.containsAll(listOf("message.upsert", "request.started", "message.delta", "task.upsert", "agent.runtime", "task.trace", "usage.updated", "memory.updated")))
        socket.close(1000, null)
    }
}
