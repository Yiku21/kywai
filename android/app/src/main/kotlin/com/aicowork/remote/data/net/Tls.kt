package com.aicowork.remote.data.net

import android.annotation.SuppressLint
import okhttp3.OkHttpClient
import okhttp3.internal.tls.OkHostnameVerifier
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/** Datos del certificado que presenta el servidor, para que el usuario compare la huella. */
data class CertificateInfo(
    val sha256: String,
    val subject: String,
    val issuer: String,
    val notBefore: Long,
    val notAfter: Long,
    val alternativeNames: List<String>,
    val selfSigned: Boolean,
) {
    val validityText: String
        get() {
            val f = DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault())
            return "${f.format(Date(notBefore))} – ${f.format(Date(notAfter))}"
        }

    companion object {
        fun from(cert: X509Certificate) = CertificateInfo(
            sha256 = Fingerprint.sha256(cert),
            subject = cert.subjectX500Principal.name,
            issuer = cert.issuerX500Principal.name,
            notBefore = cert.notBefore.time,
            notAfter = cert.notAfter.time,
            alternativeNames = runCatching {
                cert.subjectAlternativeNames?.mapNotNull { it.getOrNull(1)?.toString() }.orEmpty()
            }.getOrDefault(emptyList()),
            selfSigned = cert.subjectX500Principal == cert.issuerX500Principal,
        )
    }
}

object Fingerprint {
    fun sha256(cert: X509Certificate): String = format(MessageDigest.getInstance("SHA-256").digest(cert.encoded))

    fun format(bytes: ByteArray): String = bytes.joinToString(":") { "%02X".format(it) }

    /** Normaliza lo que pegue el usuario (minúsculas, sin separadores) para comparar. */
    fun normalize(text: String): String = text.filter { it.isLetterOrDigit() }.uppercase()

    fun matches(a: String?, b: String?): Boolean =
        a != null && b != null && normalize(a).isNotEmpty() && normalize(a) == normalize(b)

    /** Agrupa la huella en bloques de 4 octetos para leerla en voz alta o compararla en pantalla. */
    fun grouped(sha256: String): List<String> = sha256.split(':').chunked(4).map { it.joinToString(":") }
}

/** El servidor presentó un certificado que el sistema no reconoce y el usuario aún no ha confirmado. */
class UntrustedCertificateException(val certificate: CertificateInfo) :
    CertificateException("Certificado no confirmado (${certificate.sha256})")

/**
 * Valida con los certificados del sistema y, solo si eso falla, acepta exactamente el certificado cuya huella
 * SHA-256 confirmó el usuario para este servidor. No desactiva la validación TLS: cualquier otro certificado se rechaza.
 * (Lint avisa de todo X509TrustManager propio; este delega primero en el del sistema y solo añade la huella fijada.)
 */
@SuppressLint("CustomX509TrustManager")
class PinningTrustManager(
    private val system: X509TrustManager,
    private val pinnedSha256: String?,
) : X509TrustManager {

    /** Último certificado rechazado (para mostrar su huella). */
    @Volatile
    var rejected: CertificateInfo? = null
        private set

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
        try {
            system.checkServerTrusted(chain, authType)
        } catch (e: CertificateException) {
            val leaf = chain.firstOrNull() ?: throw e
            if (Fingerprint.matches(pinnedSha256, Fingerprint.sha256(leaf))) {
                leaf.checkValidity()
                return
            }
            val info = CertificateInfo.from(leaf)
            rejected = info
            throw UntrustedCertificateException(info).apply { initCause(e) }
        }
    }

    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) {
        system.checkClientTrusted(chain, authType)
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = system.acceptedIssuers

    companion object {
        fun systemDefault(): X509TrustManager {
            val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            factory.init(null as KeyStore?)
            return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
        }
    }
}

/** Verificación de nombre: la normal y, además, el certificado fijado por el usuario para este servidor. */
class PinnedHostnameVerifier(private val pinnedSha256: String?) : HostnameVerifier {
    override fun verify(hostname: String, session: javax.net.ssl.SSLSession): Boolean {
        if (OkHostnameVerifier.verify(hostname, session)) return true
        val leaf = runCatching { session.peerCertificates.firstOrNull() as? X509Certificate }.getOrNull() ?: return false
        return Fingerprint.matches(pinnedSha256, Fingerprint.sha256(leaf))
    }
}

/** Aplica la validación con huella fijada a un cliente OkHttp (solo para este servidor). */
fun OkHttpClient.Builder.pinnedTls(trustManager: PinningTrustManager, pinnedSha256: String?): OkHttpClient.Builder {
    val context = SSLContext.getInstance("TLS")
    context.init(null, arrayOf(trustManager), null)
    return sslSocketFactory(context.socketFactory, trustManager)
        .hostnameVerifier(PinnedHostnameVerifier(pinnedSha256))
}
