package com.aicowork.remote.ui.onboarding

import com.aicowork.remote.i18n.t

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aicowork.remote.data.CoworkController
import com.aicowork.remote.data.net.ApiException
import com.aicowork.remote.data.net.CertificateInfo
import com.aicowork.remote.data.net.ProbeResult
import com.aicowork.remote.data.net.ServerUrl
import com.aicowork.remote.data.net.ServerUrlResult
import com.aicowork.remote.demo.DemoServer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

enum class OnboardingStep { Welcome, Server, Certificate, Code }

data class OnboardingUi(
    val step: OnboardingStep = OnboardingStep.Welcome,
    val url: String = "",
    val urlError: String? = null,
    val checking: Boolean = false,
    val certificate: CertificateInfo? = null,
    val certificateChecked: Boolean = false,
    val pinnedSha256: String? = null,
    val code: String = "",
    val deviceName: String = "",
    val pairing: Boolean = false,
    val codeError: String? = null,
    val demo: Boolean = false,
    val demoHint: String? = null,
    val notice: String? = null,
) {
    val canPair get() = code.count { !it.isWhitespace() } >= 4 && deviceName.isNotBlank() && !pairing
}

/** Flujo de conexión: dirección → (huella del certificado propio) → código de emparejamiento. */
class OnboardingViewModel(
    private val controller: CoworkController,
    private val demoServer: DemoServer?,
    defaultDeviceName: String,
) : ViewModel() {

    private val _ui = MutableStateFlow(initial(defaultDeviceName))
    val ui: StateFlow<OnboardingUi> = _ui.asStateFlow()
    val demoAvailable get() = demoServer != null

    private var validUrl: HttpUrl? = null

    private fun initial(deviceName: String): OnboardingUi {
        val state = controller.state.value
        val previous = state.previousSession
        return OnboardingUi(
            step = if (previous != null) OnboardingStep.Server else OnboardingStep.Welcome,
            url = previous?.serverUrl?.trimEnd('/').orEmpty(),
            pinnedSha256 = previous?.pinnedSha256,
            deviceName = previous?.deviceName ?: deviceName,
            notice = state.notice,
        )
    }

    fun start() = _ui.update { it.copy(step = OnboardingStep.Server) }

    fun back() = _ui.update {
        when (it.step) {
            OnboardingStep.Code, OnboardingStep.Certificate -> it.copy(step = OnboardingStep.Server, codeError = null, certificate = null, certificateChecked = false)
            else -> it.copy(step = OnboardingStep.Welcome)
        }
    }

    fun onUrlChange(value: String) = _ui.update { it.copy(url = value, urlError = null) }
    fun onCodeChange(value: String) = _ui.update { it.copy(code = value.take(256), codeError = null) }
    fun onDeviceNameChange(value: String) = _ui.update { it.copy(deviceName = value.take(40)) }
    fun onCertificateChecked(value: Boolean) = _ui.update { it.copy(certificateChecked = value) }

    /** Comprueba la dirección y el certificado antes de pedir el código. */
    fun checkServer() {
        val current = _ui.value
        val parsed = ServerUrl.parse(current.url)
        if (parsed is ServerUrlResult.Invalid) {
            _ui.update { it.copy(urlError = parsed.reason) }
            return
        }
        val url = (parsed as ServerUrlResult.Valid).url
        validUrl = url
        // Una huella fijada antes solo vale para el mismo servidor.
        val previousUrl = controller.state.value.previousSession?.serverUrl?.toHttpUrlOrNull()
        val keepPin = current.pinnedSha256 != null && previousUrl?.host == url.host && previousUrl.port == url.port
        val pin = if (keepPin || current.demo) current.pinnedSha256 else null
        _ui.update { it.copy(checking = true, urlError = null, url = parsed.display, pinnedSha256 = pin) }
        viewModelScope.launch {
            when (val result = controller.probe(url, pin)) {
                ProbeResult.Reachable -> _ui.update { it.copy(checking = false, step = OnboardingStep.Code) }
                is ProbeResult.NeedsConfirmation -> _ui.update {
                    it.copy(checking = false, step = OnboardingStep.Certificate, certificate = result.certificate, certificateChecked = false)
                }
                is ProbeResult.Failed -> _ui.update { it.copy(checking = false, urlError = result.message) }
            }
        }
    }

    /** El usuario confirma explícitamente la huella: se fija solo para este servidor. */
    fun trustCertificate() {
        val state = _ui.value
        val cert = state.certificate ?: return
        if (!state.certificateChecked) return
        _ui.update { it.copy(pinnedSha256 = cert.sha256, step = OnboardingStep.Code) }
    }

    fun rejectCertificate() = _ui.update {
        it.copy(
            step = OnboardingStep.Server,
            certificate = null,
            certificateChecked = false,
            urlError = t("No se ha confiado en el certificado. Comprueba la dirección o la huella en AI Cowork."),
        )
    }

    fun pair() {
        val state = _ui.value
        val url = validUrl ?: return
        if (!state.canPair) return
        _ui.update { it.copy(pairing = true, codeError = null) }
        viewModelScope.launch {
            try {
                // El código de AI Cowork es base64url: distingue mayúsculas y puede llevar «-» y «_». Solo se quitan espacios.
                controller.pair(url, state.code.filter { !it.isWhitespace() }, state.deviceName, state.pinnedSha256, demo = state.demo)
                _ui.update { it.copy(pairing = false) }
            } catch (e: ApiException) {
                _ui.update { it.copy(pairing = false, codeError = e.message) }
            } catch (e: java.io.IOException) {
                _ui.update { it.copy(pairing = false, codeError = e.message ?: t("No se pudo conectar")) }
            }
        }
    }

    /** Arranca el servidor simulado integrado y rellena la dirección y el código. */
    fun useDemo() {
        val demo = demoServer ?: return
        _ui.update { it.copy(checking = true, step = OnboardingStep.Server) }
        viewModelScope.launch {
            val info = runCatching { demo.start() }.getOrElse { e ->
                _ui.update { it.copy(checking = false, urlError = t("No se pudo arrancar el servidor simulado: {message}", "message" to e.message)) }
                return@launch
            }
            _ui.update {
                it.copy(
                    url = info.url,
                    code = info.code,
                    demo = true,
                    demoHint = t("Servidor simulado en este móvil · código {code}", "code" to info.code),
                    checking = false,
                )
            }
            checkServer()
        }
    }
}
