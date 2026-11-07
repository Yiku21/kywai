package com.aicowork.remote.data.update

import com.aicowork.remote.i18n.t

import com.aicowork.remote.data.CoworkController
import com.aicowork.remote.data.model.AppRelease
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest

/** En qué punto está la actualización de Órbita (Ajustes → «Buscar actualizaciones»). */
sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data object UpToDate : UpdateState
    data class Available(val release: AppRelease) : UpdateState
    data class Downloading(val release: AppRelease, val progress: Float) : UpdateState
    /** Android pide permiso (una sola vez) para que Órbita instale su versión nueva. */
    data class NeedsPermission(val release: AppRelease) : UpdateState
    data class Installing(val release: AppRelease) : UpdateState
    data class Failed(val message: String, val release: AppRelease? = null) : UpdateState
}

/**
 * Actualiza Órbita desde el ordenador, sin pasar la APK a mano: pregunta qué versión tiene, la descarga, comprueba
 * que es exactamente la anunciada y se la da a Android, que la instala encima (misma firma, el móvil sigue emparejado).
 */
class AppUpdater(
    private val controller: CoworkController,
    private val installer: AppInstaller,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state
    val versionName: String get() = installer.versionName
    private var job: Job? = null

    init {
        scope.launch {
            installer.failures.collect { message -> _state.value = UpdateState.Failed(message, releaseOf(_state.value)) }
        }
        // Las descargas de versiones ya instaladas sobran.
        scope.launch(Dispatchers.IO) {
            installer.downloadDir.listFiles()?.forEach { f ->
                val code = APK_NAME.matchEntire(f.name)?.groupValues?.get(1)?.toLongOrNull()
                if (code == null || code <= installer.versionCode) f.delete()
            }
        }
    }

    private val busy get() = job?.isActive == true

    /** Pregunta al ordenador qué versión tiene. */
    fun check() {
        if (busy) return
        if (installer.isDevBuild) {
            _state.value = UpdateState.Failed(t("Esta es la versión de desarrollo: se actualiza desde Android Studio."))
            return
        }
        val snapshot = controller.state.value.snapshot
        if (snapshot != null && !snapshot.capabilities.appUpdate) {
            _state.value = UpdateState.Failed(t("El ordenador aún no ofrece actualizaciones de Órbita: actualiza AI Cowork en él (⋮ → «Buscar actualizaciones…»)."))
            return
        }
        _state.value = UpdateState.Checking
        job = scope.launch {
            controller.appRelease().fold(
                onSuccess = { r -> _state.value = if (r.versionCode > installer.versionCode) UpdateState.Available(r) else UpdateState.UpToDate },
                onFailure = { e -> _state.value = UpdateState.Failed(e.message ?: t("No se pudo consultar el ordenador.")) },
            )
        }
    }

    /** Descarga (si hace falta) e instala la versión encontrada. */
    fun install() {
        if (busy) return
        val release = releaseOf(_state.value) ?: return
        job = scope.launch {
            val file = File(installer.downloadDir, "orbita-${release.versionCode}.apk")
            if (!(file.isFile && sha256(file) == release.sha256)) {
                _state.value = UpdateState.Downloading(release, 0f)
                var shown = 0f
                val download = controller.downloadAppRelease(file) { p ->
                    if (p - shown >= 0.02f || p >= 1f) {
                        shown = p
                        _state.value = UpdateState.Downloading(release, p)
                    }
                }
                val failure = download.exceptionOrNull()?.let { it.message ?: t("No se pudo descargar.") }
                    ?: if (sha256(file) != release.sha256) t("La descarga no es la versión anunciada: vuelve a intentarlo.") else null
                if (failure != null) {
                    withContext(Dispatchers.IO) { file.delete() }
                    _state.value = UpdateState.Failed(failure, release)
                    return@launch
                }
            }
            if (!installer.canInstall()) {
                _state.value = UpdateState.NeedsPermission(release)
                return@launch
            }
            _state.value = UpdateState.Installing(release)
            try {
                installer.install(file)
            } catch (e: Exception) {
                _state.value = UpdateState.Failed(e.message?.let { t("Android no pudo instalarla: {v1}", "v1" to it) } ?: t("Android no pudo instalarla."), release)
            }
        }
    }

    /** Abre el ajuste de Android para que Órbita pueda instalar su versión nueva. */
    fun allowInstalls() = installer.requestPermission()

    /** Al volver a Órbita (por ejemplo, después de dar el permiso), sigue con la instalación. */
    fun resume() {
        if (_state.value is UpdateState.NeedsPermission && installer.canInstall()) install()
    }

    private fun releaseOf(state: UpdateState): AppRelease? = when (state) {
        is UpdateState.Available -> state.release
        is UpdateState.Downloading -> state.release
        is UpdateState.NeedsPermission -> state.release
        is UpdateState.Installing -> state.release
        is UpdateState.Failed -> state.release
        else -> null
    }

    private companion object {
        val APK_NAME = Regex("""orbita-(\d+)\.apk""")
    }
}

internal suspend fun sha256(file: File): String = withContext(Dispatchers.IO) {
    if (!file.isFile) return@withContext ""
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
        }
    }
    digest.digest().joinToString("") { "%02x".format(it) }
}
