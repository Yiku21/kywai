package com.aicowork.remote.data

import com.aicowork.remote.data.net.Fingerprint
import com.aicowork.remote.data.net.ServerUrl
import com.aicowork.remote.data.net.ServerUrlResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerUrlTest {
    private fun valid(input: String) = (ServerUrl.parse(input) as ServerUrlResult.Valid)

    @Test
    fun `adds https and drops the path`() {
        assertEquals("https://100.101.102.103:8788", valid("100.101.102.103:8788").display)
        assertEquals("https://mi-mac.tail1234.ts.net", valid(" https://mi-mac.tail1234.ts.net/app/?x=1 ").display)
    }

    @Test
    fun `rejects cleartext to remote hosts but allows local development`() {
        assertTrue(ServerUrl.parse("http://100.64.0.1:8787") is ServerUrlResult.Invalid)
        assertEquals("http://10.0.2.2:8790", valid("http://10.0.2.2:8790").display)
        assertEquals("http://127.0.0.1:8790", valid("http://127.0.0.1:8790").display)
        assertTrue(ServerUrl.parse("") is ServerUrlResult.Invalid)
        assertTrue(ServerUrl.parse("ftp://x") is ServerUrlResult.Invalid)
        assertTrue(ServerUrl.parse("mi mac") is ServerUrlResult.Invalid)
    }

    @Test
    fun `detects tailscale addresses`() {
        assertTrue(ServerUrl.isTailscale(valid("100.100.1.2").url))
        assertTrue(ServerUrl.isTailscale(valid("pc.tailnet.ts.net").url))
        assertFalse(ServerUrl.isTailscale(valid("192.168.1.2").url))
        assertFalse(ServerUrl.isTailscale(valid("100.200.1.2").url))
    }

    @Test
    fun `fingerprints compare regardless of format`() {
        assertTrue(Fingerprint.matches("ab:cd:ef", "ABCDEF"))
        assertFalse(Fingerprint.matches("AB:CD", "AB:CE"))
        assertFalse(Fingerprint.matches(null, "AB"))
        assertEquals(listOf("01:02:03:04", "05"), Fingerprint.grouped("01:02:03:04:05"))
    }
}
