package com.aicowork.mock

import java.net.InetAddress

/**
 * Arranca el servidor simulado desde la línea de comandos:
 *
 *   ./gradlew :mockserver:run --args="--port 8790 --tls --host 0.0.0.0"
 *
 * Desde el emulador de Android, el ordenador es 10.0.2.2; desde un móvil físico, usa la IP de Tailscale o de la red local.
 */
fun main(args: Array<String>) {
    fun arg(name: String): String? = args.indexOf(name).takeIf { it >= 0 }?.let { args.getOrNull(it + 1) }
    val port = arg("--port")?.toIntOrNull() ?: 8790
    val host = arg("--host") ?: "0.0.0.0"
    val code = arg("--code") ?: MockCoworkServer.DEFAULT_CODE
    val tls = "--tls" in args
    val extraHosts = arg("--san")?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
    val hosts = listOf("localhost", "127.0.0.1", "10.0.2.2") + extraHosts

    val server = MockCoworkServer(pairingCode = code, heldCertificate = if (tls) MockCoworkServer.selfSigned(hosts) else null)
    server.start(port, InetAddress.getByName(host))
    val scheme = if (tls) "https" else "http"
    println("Servidor simulado de kywai escuchando en $scheme://$host:$port")
    println("  Emulador Android: $scheme://10.0.2.2:$port")
    println("  Código de emparejamiento: $code")
    server.certificateSha256?.let { println("  Huella SHA-256 del certificado: $it") }
    println("Pulsa Ctrl+C para salir.")
    Runtime.getRuntime().addShutdownHook(Thread { server.close() })
    Thread.currentThread().join()
}
