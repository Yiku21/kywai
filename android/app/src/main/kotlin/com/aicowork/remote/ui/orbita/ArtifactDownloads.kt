package com.aicowork.remote.ui.orbita

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Download
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.aicowork.remote.data.model.Artifact
import com.aicowork.remote.data.net.RawContent
import com.aicowork.remote.i18n.t
import java.io.File
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Nombres relativos del zip: solo la selección y sin rutas que puedan escapar al extraerla. */
internal fun artifactDownloadNames(artifacts: List<Artifact>): List<String> {
    require(artifacts.isNotEmpty())
    val folder = Deliverables.commonFolder(artifacts.map { it.relPath })
    val names = artifacts.map {
        val path = it.relPath.replace('\\', '/')
        require(!path.startsWith('/') && !path.contains(':') && path.split('/').none { p -> p == ".." || p == "." })
        val name = if (folder.isEmpty()) path else path.removePrefix("$folder/")
        require(name.isNotEmpty() && !name.startsWith('/') && !name.contains(':') && !name.contains('\u0000'))
        require(name.split('/').none { p -> p.isEmpty() || p == ".." || p == "." })
        name
    }
    require(names.distinct().size == names.size)
    return names
}

/** Usa la API de archivos existente: un archivo conserva sus bytes; varios se empaquetan en un zip. */
internal suspend fun writeArtifactSelection(artifacts: List<Artifact>, fetch: suspend (String) -> Result<RawContent>, out: OutputStream) {
    val names = artifactDownloadNames(artifacts)
    if (artifacts.size == 1) out.write(fetch(artifacts.first().id).getOrThrow().bytes)
    else ZipOutputStream(out).use { zip ->
        artifacts.zip(names).forEach { (artifact, name) ->
            val raw = fetch(artifact.id).getOrThrow()
            zip.putNextEntry(ZipEntry(name))
            zip.write(raw.bytes)
            zip.closeEntry()
        }
    }
}

/** Guardar desde la tarjeta del chat o de Resultados, con el selector de destino de Android. */
@Composable
internal fun ArtifactDownloadButton(artifacts: List<Artifact>, model: OrbitaModel, enabled: Boolean) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<List<Artifact>>(emptyList()) }
    val name = if (artifacts.size == 1) artifacts.first().name else "${Deliverables.folderName(Deliverables.commonFolder(artifacts.map { it.relPath }))}.zip"
    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val selected = pending
        pending = emptyList()
        if (uri == null || selected.isEmpty()) { busy = false; return@rememberLauncherForActivityResult }
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val temporary = File.createTempFile("entregable-", ".download", context.cacheDir)
                    try {
                        temporary.outputStream().use { writeArtifactSelection(selected, model.controller::fetchArtifact, it) }
                        val output = context.contentResolver.openOutputStream(uri) ?: error("No se pudo abrir el destino")
                        output.use { stream -> temporary.inputStream().use { it.copyTo(stream) } }
                    } finally { temporary.delete() }
                }
                model.feedback.confirm()
                model.toast(t("Guardado en el móvil"), Toast.Tone.Success)
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { model.feedback.reject(); model.toast(t("No se pudo guardar"), Toast.Tone.Error) }
            finally { busy = false }
        }
    }
    IconAction(Icons.Outlined.Download, t("Descargar {name}", "name" to name), enabled = enabled && !busy, onClick = {
        pending = artifacts.toList()
        busy = true
        saver.launch(name)
    })
}
