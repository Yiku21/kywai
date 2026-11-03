package com.aicowork.remote.data

import com.aicowork.remote.data.model.MemoryUpdateRequest
import com.aicowork.remote.data.net.ApiException
import com.aicowork.remote.data.net.CoworkApiClient
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Las peticiones de Órbita llegan al ordenador exactamente como pide el contrato. */
class ApiClientRequestsTest {
    private val server = MockWebServer().apply { start() }
    private val client = CoworkApiClient(server.url("/"), null, { "tok" })

    @After
    fun tearDown() {
        client.shutdown()
        server.shutdown()
    }

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    @Test
    fun queriesGoInTheQueryNotInThePath() = runBlocking {
        server.enqueue(json("""{"conversation":{"id":"p 1"}}"""))
        client.snapshot("p 1")
        val snap = server.takeRequest()
        assertEquals("/api/mobile/v1/snapshot", snap.requestUrl!!.encodedPath)
        assertEquals("p 1", snap.requestUrl!!.queryParameter("conversationId"))
        assertEquals("Bearer tok", snap.getHeader("Authorization"))

        server.enqueue(json("""{"attachments":[],"folder":null}"""))
        client.files("p1", "  informe final ")
        val files = server.takeRequest().requestUrl!!
        assertEquals("/api/mobile/v1/files", files.encodedPath)
        assertEquals("informe final", files.queryParameter("q"))
    }

    @Test
    fun memoryUpdatesOnlySendWhatChanges() = runBlocking {
        server.enqueue(json("""{"entry":{"id":"m1","status":"confirmed"}}"""))
        val entry = client.updateMemory(MemoryUpdateRequest("p1", status = "confirmed"), "m1")
        assertEquals("confirmed", entry?.status)
        val body = server.takeRequest().body.readUtf8()
        assertEquals("""{"conversationId":"p1","status":"confirmed"}""", body)
    }

    @Test
    fun attachmentsTravelWithTheMessageOnlyWhenThereAreSome() = runBlocking {
        server.enqueue(json("""{"requestId":"r1"}"""))
        client.sendMessage("p1", "Hola", "c1", listOf("a1", "a2"))
        assertTrue(server.takeRequest().body.readUtf8().contains(""""attachmentIds":["a1","a2"]"""))
        server.enqueue(json("""{"requestId":"r2"}"""))
        client.sendMessage("p1", "Hola", "c2")
        assertFalse(server.takeRequest().body.readUtf8().contains("attachmentIds"))
    }

    @Test
    fun uploadsStreamTheFileAndReportProgress() = runBlocking {
        val bytes = ByteArray(300_000) { (it % 251).toByte() }
        server.enqueue(json("""{"attachment":{"id":"a1","name":"foto 1.png","relPath":"attachments/foto 1.png","mime":"image/png","size":300000}}""").setResponseCode(201))
        val progress = mutableListOf<Float>()
        val attachment = client.upload("p1", "foto 1.png", bytes.size.toLong(), "image/png", { bytes.inputStream() }) { progress += it }
        assertEquals("a1", attachment?.id)
        val request = server.takeRequest()
        assertEquals("foto 1.png", request.requestUrl!!.queryParameter("name"))
        assertEquals("image/png", request.getHeader("Content-Type"))
        assertArrayEquals(bytes, request.body.readByteArray())
        assertEquals(1f, progress.last())
    }

    @Test
    fun voiceNotesGoAsWavAndComeBackAsText() = runBlocking {
        val file = java.io.File.createTempFile("nota", ".wav").apply { writeBytes(ByteArray(3200) { 1 }) }
        try {
            server.enqueue(json("""{"text":"hola equipo"}"""))
            assertEquals("hola equipo", client.transcribe(file))
            val request = server.takeRequest()
            assertEquals("/api/mobile/v1/voice/transcribe", request.requestUrl!!.encodedPath)
            assertEquals("es", request.requestUrl!!.queryParameter("language"))
            assertEquals("audio/wav", request.getHeader("Content-Type"))
            assertEquals(3200L, request.bodySize)
        } finally {
            file.delete()
        }
    }

    @Test
    fun plansAreApprovedOrDiscardedByTheirMessage() = runBlocking {
        server.enqueue(json("""{"conversationId":"p1","messageId":"m 1","requestId":"r1","status":"approved"}"""))
        client.decidePlan("p1", "m 1", approve = true)
        val approve = server.takeRequest()
        assertEquals("/api/mobile/v1/plans/m%201/approve", approve.requestUrl!!.encodedPath)
        assertEquals("""{"conversationId":"p1"}""", approve.body.readUtf8())

        server.enqueue(json("""{"conversationId":"p1","messageId":"m2","requestId":"r2","status":"rejected"}"""))
        client.decidePlan("p1", "m2", approve = false)
        assertEquals("/api/mobile/v1/plans/m2/reject", server.takeRequest().requestUrl!!.encodedPath)

        server.enqueue(MockResponse().setResponseCode(409).setHeader("Content-Type", "application/json").setBody("""{"code":"PLAN_NOT_PENDING","message":"Ese plan ya no está pendiente","retryable":false}"""))
        try {
            client.decidePlan("p1", "m2", approve = true)
            fail("debería rechazarlo")
        } catch (e: ApiException) {
            assertEquals(409, e.status)
            assertEquals("Ese plan ya no está pendiente", e.message)
        }
        server.takeRequest()

        server.enqueue(json("""{"planApproval":false}"""))
        assertFalse(client.setPlanApproval(false))
        val setting = server.takeRequest()
        assertEquals("/api/mobile/v1/settings/plan-approval", setting.requestUrl!!.encodedPath)
        assertEquals("""{"enabled":false}""", setting.body.readUtf8())
    }

    @Test
    fun resultsDownloadWithTheirTypeAndTooBigOnesAreRefused() = runBlocking {
        server.enqueue(MockResponse().setHeader("Content-Type", "text/markdown; charset=utf-8").setBody("# Hola"))
        val raw = client.artifactRaw("p1", "a1")
        assertEquals("text/markdown", raw.contentType)
        assertEquals("# Hola", raw.text())
        assertEquals("/api/mobile/v1/artifacts/a1/raw", server.takeRequest().requestUrl!!.encodedPath)

        server.enqueue(MockResponse().setBody(Buffer().write(ByteArray(2048))))
        try {
            client.artifactRaw("p1", "a2", maxBytes = 1024)
            fail("debería rechazarlo")
        } catch (e: ApiException) {
            assertEquals(413, e.status)
        }
    }

    @Test
    fun slashModelReadsAndChangesHermesModelAsTheContractSays() = runBlocking {
        val body = """{"installed":true,"current":{"provider":"omnirouter","model":"auto/smart","fromApp":false},"hermesDefault":{"provider":"omnirouter","model":"auto/smart"},"providers":[{"id":"anthropic","label":"Anthropic","models":["claude-opus-5-5"]}],"updatedAt":1791686531740}"""
        server.enqueue(json(body))
        val info = client.hermesModels()
        assertEquals("auto/smart", info.current.model)
        assertEquals(listOf("claude-opus-5-5"), info.providers.single().models)
        assertEquals("/api/mobile/v1/hermes/models", server.takeRequest().requestUrl!!.encodedPath)

        server.enqueue(json(body))
        client.setHermesModel(com.aicowork.remote.data.model.HermesChoice("anthropic", "claude-opus-5-5"))
        val set = server.takeRequest()
        assertEquals("/api/mobile/v1/hermes/model", set.requestUrl!!.encodedPath)
        assertEquals("""{"provider":"anthropic","model":"claude-opus-5-5"}""", set.body.readUtf8())

        server.enqueue(json(body))
        client.setHermesModel(null)
        assertEquals("""{"reset":true}""", server.takeRequest().body.readUtf8())
    }

    @Test
    fun orbitaAsksForTheNewVersionAndDownloadsItsApkToAFile() = runBlocking {
        server.enqueue(json("""{"versionCode":812,"versionName":"1.812","size":5,"sha256":"ab","builtAt":null}"""))
        val release = client.appRelease()
        assertEquals(812L, release.versionCode)
        assertEquals("1.812", release.versionName)
        val info = server.takeRequest()
        assertEquals("/api/mobile/v1/app/android", info.requestUrl!!.encodedPath)
        assertEquals("Bearer tok", info.getHeader("Authorization"))

        val apk = ByteArray(200_000) { (it % 7).toByte() }
        server.enqueue(MockResponse().setHeader("Content-Type", "application/vnd.android.package-archive").setBody(Buffer().write(apk)))
        val target = java.io.File.createTempFile("orbita", ".apk").apply { deleteOnExit() }
        val progress = mutableListOf<Float>()
        client.downloadApk(target) { progress += it }
        assertArrayEquals(apk, target.readBytes())
        assertEquals(1f, progress.last())
        assertEquals("/api/mobile/v1/app/android/apk", server.takeRequest().requestUrl!!.encodedPath)

        server.enqueue(json("""{"code":"NO_ORBITA_RELEASE","message":"El ordenador aún no tiene ninguna versión de Órbita","retryable":false}""").setResponseCode(404))
        try {
            client.appRelease()
            fail("debería fallar")
        } catch (e: ApiException) {
            assertEquals("NO_ORBITA_RELEASE", e.code)
            assertEquals("El ordenador aún no tiene ninguna versión de Órbita", e.message)
        }
        Unit
    }
}
