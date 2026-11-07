package com.aicowork.remote.data

import com.aicowork.remote.data.net.CoworkApiClient
import com.aicowork.remote.data.net.ProbeResult
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyServerProbeTest {
    @Test fun rejectsDesktopVersionWithoutMobileApi() = runBlocking<Unit> {
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"error":"Sin acceso: abre el enlace de acceso de kywai"}"""))
        server.start()
        val client = CoworkApiClient(server.url("/"), null, { null })
        try {
            val result = client.probe()
            assertTrue(result is ProbeResult.Failed && result.message.contains("Actualiza"))
        } finally {
            client.shutdown()
            server.shutdown()
        }
    }
}
