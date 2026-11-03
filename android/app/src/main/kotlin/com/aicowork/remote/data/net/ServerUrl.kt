package com.aicowork.remote.data.net

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** Resultado de interpretar la dirección que escribe el usuario. */
sealed interface ServerUrlResult {
    data class Valid(val url: HttpUrl) : ServerUrlResult {
        val display: String get() = url.toString().trimEnd('/')
    }
    data class Invalid(val reason: String) : ServerUrlResult
}

object ServerUrl {
    /** Hosts donde se permite HTTP sin cifrar (mismo dispositivo o el ordenador visto desde el emulador). */
    val LOCAL_HOSTS = setOf("localhost", "127.0.0.1", "10.0.2.2", "::1")

    /**
     * Acepta `100.64.1.2:8788`, `mi-mac.tail1234.ts.net` o una URL completa. Sin esquema se usa HTTPS.
     * Se descarta la ruta: la app siempre habla con `/api/mobile/v1`.
     */
    fun parse(input: String): ServerUrlResult {
        val trimmed = input.trim().trimEnd('/')
        if (trimmed.isEmpty()) return ServerUrlResult.Invalid("Escribe la dirección del ordenador con AI Cowork")
        if (trimmed.any { it.isWhitespace() }) return ServerUrlResult.Invalid("La dirección no puede tener espacios")
        val withScheme = if ("://" in trimmed) trimmed else "https://$trimmed"
        val scheme = withScheme.substringBefore("://").lowercase()
        if (scheme != "https" && scheme != "http") {
            return ServerUrlResult.Invalid("Usa una dirección https://")
        }
        val url = withScheme.toHttpUrlOrNull() ?: return ServerUrlResult.Invalid("No parece una dirección válida")
        if (url.host.isBlank()) return ServerUrlResult.Invalid("Falta el nombre o la IP del ordenador")
        if (!url.isHttps && url.host !in LOCAL_HOSTS) {
            return ServerUrlResult.Invalid(
                "Por seguridad la conexión debe ser https://. AI Cowork ofrece HTTPS en el puerto 8788 o mediante Tailscale Serve."
            )
        }
        return ServerUrlResult.Valid(url.newBuilder().encodedPath("/").query(null).fragment(null).build())
    }

    /** Direcciones de Tailscale: IPv4 100.64.0.0/10, IPv6 fd7a:115c:a1e0::/48 o nombres *.ts.net. */
    fun isTailscale(url: HttpUrl): Boolean {
        val host = url.host.lowercase()
        if (host.endsWith(".ts.net")) return true
        if (host.startsWith("fd7a:115c:a1e0:")) return true
        val parts = host.split('.').mapNotNull { it.toIntOrNull() }
        return parts.size == 4 && parts[0] == 100 && parts[1] in 64..127
    }
}
