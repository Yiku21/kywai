package com.aicowork.remote.demo

/** Datos para emparejar con el servidor simulado integrado. */
data class DemoInfo(val url: String, val code: String)

/**
 * Servidor simulado que cumple el contrato `/api/mobile/v1`, integrado en la variante de depuración para recorrer
 * la app sin el ordenador. En la variante de publicación no existe ([createDemoServer] devuelve null).
 */
interface DemoServer {
    /** Arranca (o reanuda) el servidor en el propio móvil. Con [restoreToken] acepta el token de la sesión anterior. */
    suspend fun start(restoreToken: String? = null): DemoInfo
    fun stop()
}
