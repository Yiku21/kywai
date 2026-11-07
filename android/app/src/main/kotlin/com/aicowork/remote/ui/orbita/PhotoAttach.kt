package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.content.ActivityNotFoundException
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.core.content.FileProvider
import com.aicowork.remote.data.CoworkUiState
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay

/** Sube un archivo elegido en el teléfono (galería o selector de archivos) al proyecto. */
fun uploadUri(context: Context, model: OrbitaModel, uri: Uri) {
    val resolver = context.contentResolver
    var name = "archivo"
    var size = -1L
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
            name = c.getString(0) ?: name
            if (!c.isNull(1)) size = c.getLong(1)
        }
    }
    model.controller.upload(name, size, resolver.getType(uri)) { resolver.openInputStream(uri) ?: throw java.io.IOException(t("No se puede abrir {name}", "name" to name)) }
}

/** Lo que se termina de subir va al equipo con el próximo mensaje, se suba desde el chat o desde Archivos. */
@Composable
fun AttachFinishedUploads(model: OrbitaModel, state: CoworkUiState) {
    LaunchedEffect(state.uploads) {
        state.uploads.filter { it.done && it.attachmentId != null }.forEach { u ->
            model.pendingAttachments = model.pendingAttachments + u.attachmentId!!
            model.feedback.play(Sfx.FileCreated)
            if (u.queued) model.toast(t("Sin conexión: {name} se enviará con tu mensaje al volver", "name" to u.name))
            delay(2_500)
            model.controller.dismissUpload(u.id)
        }
    }
}

/** Fotos de la cámara: se guardan en la caché de la app (las de otras veces se borran al hacer una nueva). */
private object CameraShots {
    fun dir(context: Context) = File(context.cacheDir, "fotos").apply { mkdirs() }

    fun next(context: Context): File {
        dir(context).listFiles()?.forEach { it.delete() }
        val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.ROOT).format(Date())
        return File(dir(context), "foto-$stamp.jpg")
    }
}

/**
 * Botón de cámara del chat, al lado del clip: «Hacer una foto» abre la cámara del dispositivo y
 * «Elegir de la galería» el selector de fotos de Android (no pide permisos). Lo elegido se sube y
 * queda adjunto al mensaje que estás escribiendo.
 */
@Composable
fun PhotoButton(model: OrbitaModel, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    // La ruta de la foto en curso sobrevive si Android cierra Órbita mientras la cámara está abierta.
    var shot by rememberSaveable { mutableStateOf<String?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        val file = shot?.let(::File) ?: return@rememberLauncherForActivityResult
        shot = null
        if (ok && file.length() > 0) {
            model.controller.upload(file.name, file.length(), "image/jpeg") { file.inputStream() }
        } else file.delete()
    }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        uris.forEach { uploadUri(context, model, it) }
    }
    Box(modifier) {
        IconAction(Icons.Outlined.PhotoCamera, t("Añadir una foto"), onClick = { menu = true }, modifier = Modifier.testTag("photo"))
        DropdownMenu(menu, onDismissRequest = { menu = false }, containerColor = Orbita.GlassPopover) {
            DropdownMenuItem(
                text = { Text(t("Hacer una foto")) },
                leadingIcon = { Icon(Icons.Outlined.PhotoCamera, null) },
                modifier = Modifier.testTag("photo-camera"),
                onClick = {
                    menu = false
                    val file = CameraShots.next(context)
                    shot = file.path
                    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fotos", file)
                    try {
                        camera.launch(uri)
                    } catch (_: ActivityNotFoundException) {
                        shot = null
                        model.toast(t("Este dispositivo no tiene cámara"), Toast.Tone.Error)
                    }
                },
            )
            DropdownMenuItem(
                text = { Text(t("Elegir de la galería")) },
                leadingIcon = { Icon(Icons.Outlined.Image, null) },
                modifier = Modifier.testTag("photo-gallery"),
                onClick = {
                    menu = false
                    gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                },
            )
        }
    }
}
