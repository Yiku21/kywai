package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.Attachment
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Los adjuntos de un mensaje tuyo: las imágenes en miniatura y el resto como fichas. Al tocarlos se abren en el lector
 * (como en el escritorio), y ahí se pasa de uno a otro con ‹ ›.
 */
@Composable
fun ChatAttachments(list: List<Attachment>, model: OrbitaModel, canOpen: Boolean) {
    if (list.isEmpty()) return
    // Una miniatura que no se pudo cargar vuelve a ser una ficha con su nombre.
    fun failed(a: Attachment) = model.previews[thumbKey(a)] is Preview.None
    val images = list.filter { canOpen && kindOfName(it.name, it.mime) == "image" && !it.name.endsWith(".svg", true) && !failed(it) }
    val others = list.filter { it !in images }
    val ordered = images + others
    val open = { a: Attachment ->
        model.openViewer(ordered.map { ViewerTarget.File("attachment", it.relPath, it.name, kindOfName(it.name, it.mime)) }, ordered.indexOf(a))
    }
    Column(Modifier.padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), horizontalAlignment = Alignment.End) {
        if (images.size == 1) {
            AttachmentThumb(images.first(), model, Modifier.widthIn(max = 260.dp).heightIn(max = 240.dp), fit = true) { open(images.first()) }
        } else if (images.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                images.forEach { a -> AttachmentThumb(a, model, Modifier.width(132.dp).aspectRatio(1.25f), fit = false) { open(a) } }
            }
        }
        others.forEach { a ->
            Row(
                Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Orbita.Card)
                    .border(1.dp, Orbita.CardEdge, RoundedCornerShape(12.dp))
                    .tappable(enabled = canOpen, haptic = Haptic.Tap) { open(a) }
                    .semantics { contentDescription = t("Ver {name}", "name" to a.name) }
                    .padding(horizontal = 10.dp, vertical = 7.dp)
                    .testTag("attachment-${a.id}"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val (icon, tint) = kindIcon(kindOfName(a.name, a.mime), a.name)
                Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text(a.name, color = Orbita.Text, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 220.dp))
            }
        }
    }
}

private fun thumbKey(a: Attachment) = "att:${a.relPath}"

/** Miniatura de una imagen adjunta: se pide una vez al ordenador y se guarda reducida. */
@Composable
private fun AttachmentThumb(a: Attachment, model: OrbitaModel, modifier: Modifier, fit: Boolean, onOpen: () -> Unit) {
    val key = thumbKey(a)
    val preview = model.previews[key]
    LaunchedEffect(key) {
        if (model.previews.containsKey(key)) return@LaunchedEffect
        model.previews[key] = Preview.Loading
        model.previews[key] = model.controller.fetchFile("attachment", a.relPath).fold(
            { raw ->
                withContext(Dispatchers.Default) {
                    if (!raw.isImage) return@withContext Preview.None(t("No es una imagen"))
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size, bounds)
                    var sample = 1
                    while (bounds.outWidth / sample > 720) sample *= 2
                    BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                        ?.let { Preview.Picture(it.asImageBitmap()) } ?: Preview.None(t("Imagen ilegible"))
                }
            },
            { Preview.None(it.message) },
        )
    }
    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier
            .clip(shape)
            .background(Orbita.Card)
            .border(1.dp, Orbita.CardEdge, shape)
            .tappable(haptic = Haptic.Tap, onClick = onOpen)
            .semantics { contentDescription = t("Ver {name}", "name" to a.name) }
            .testTag("attachment-thumb-${a.id}"),
        contentAlignment = Alignment.Center,
    ) {
        when (preview) {
            is Preview.Picture -> Image(preview.image, contentDescription = null, contentScale = if (fit) ContentScale.Fit else ContentScale.Crop, modifier = if (fit) Modifier else Modifier.matchParentSize())
            else -> CircularProgressIndicator(color = Orbita.Accent, strokeWidth = 2.dp, modifier = Modifier.padding(28.dp).size(22.dp))
        }
    }
}
