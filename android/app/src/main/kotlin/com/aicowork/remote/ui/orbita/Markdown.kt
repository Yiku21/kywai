package com.aicowork.remote.ui.orbita

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

/** Una imagen `![texto](ruta)` y lo que hay antes y después en la misma línea. */
internal sealed interface LinePart {
    data class Text(val text: String) : LinePart
    data class Image(val alt: String, val url: String) : LinePart
}

private val IMAGE = Regex("!\\[([^\\]]*)]\\(\\s*<?([^)\\s>]+)>?(?:\\s+\"[^\"]*\")?\\s*\\)")

/** Parte una línea en texto e imágenes, en orden (sin imágenes, una sola parte de texto). */
internal fun splitImages(line: String): List<LinePart> {
    val parts = mutableListOf<LinePart>()
    var last = 0
    for (m in IMAGE.findAll(line)) {
        if (m.range.first > last) parts += LinePart.Text(line.substring(last, m.range.first))
        parts += LinePart.Image(m.groupValues[1], m.groupValues[2])
        last = m.range.last + 1
    }
    if (last < line.length) parts += LinePart.Text(line.substring(last))
    return parts
}

/** Dónde se piden las imágenes de los mensajes: el modelo las baja del ordenador y las guarda. */
class MarkdownImages(val model: OrbitaModel)

val LocalMarkdownImages = staticCompositionLocalOf<MarkdownImages?> { null }

/** Bloques de Markdown sencillo: lo que escriben los agentes (títulos, listas, código, negritas). */
private sealed interface Block {
    data class Image(val alt: String, val url: String) : Block
    data class Heading(val level: Int, val text: String) : Block
    data class Paragraph(val text: String) : Block
    data class Bullet(val marker: String, val text: String, val indent: Int) : Block
    data class Code(val text: String) : Block
    data class Quote(val text: String) : Block
    data object Rule : Block
}

private fun parse(markdown: String): List<Block> {
    val blocks = mutableListOf<Block>()
    val lines = markdown.replace("\r\n", "\n").split('\n')
    var i = 0
    val paragraph = StringBuilder()
    fun flush() {
        if (paragraph.isNotBlank()) blocks += Block.Paragraph(paragraph.toString().trim())
        paragraph.clear()
    }
    while (i < lines.size) {
        val line = lines[i]
        val trimmed = line.trimStart()
        when {
            trimmed.startsWith("```") -> {
                flush()
                val code = StringBuilder()
                i++
                while (i < lines.size && !lines[i].trimStart().startsWith("```")) {
                    code.appendLine(lines[i]); i++
                }
                blocks += Block.Code(code.toString().trimEnd())
            }
            trimmed.startsWith("#") -> {
                flush()
                val level = trimmed.takeWhile { it == '#' }.length.coerceAtMost(4)
                blocks += Block.Heading(level, trimmed.drop(level).trim())
            }
            Regex("^([-*+]|\\d+[.)])\\s+").containsMatchIn(trimmed) -> {
                flush()
                val m = Regex("^([-*+]|\\d+[.)])\\s+(.*)$").find(trimmed)!!
                val marker = m.groupValues[1].let { if (it in setOf("-", "*", "+")) "•" else it }
                blocks += Block.Bullet(marker, m.groupValues[2], (line.length - trimmed.length) / 2)
            }
            trimmed.startsWith(">") -> {
                flush()
                blocks += Block.Quote(trimmed.removePrefix(">").trim())
            }
            trimmed.matches(Regex("^(-{3,}|\\*{3,}|_{3,})$")) -> {
                flush(); blocks += Block.Rule
            }
            trimmed.isEmpty() -> flush()
            else -> {
                val parts = splitImages(line.trim())
                if (parts.any { it is LinePart.Image }) {
                    // Las imágenes van en su propio bloque; el texto de alrededor, en párrafos.
                    flush()
                    for (p in parts) when (p) {
                        is LinePart.Image -> blocks += Block.Image(p.alt, p.url)
                        is LinePart.Text -> if (p.text.isNotBlank()) blocks += Block.Paragraph(p.text.trim())
                    }
                } else {
                    if (paragraph.isNotEmpty()) paragraph.append('\n')
                    paragraph.append(line.trim())
                }
            }
        }
        i++
    }
    flush()
    return blocks
}

/** Negritas, cursivas, `código` y enlaces [texto](url) (se muestra el texto). */
fun inline(text: String, codeColor: Color = Color(0xFFBFE6EE)): AnnotatedString = buildAnnotatedString {
    var i = 0
    while (i < text.length) {
        when {
            text.startsWith("**", i) -> {
                val end = text.indexOf("**", i + 2)
                if (end > i) { withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(text.substring(i + 2, end)) }; i = end + 2 } else { append(text[i]); i++ }
            }
            text[i] == '`' -> {
                val end = text.indexOf('`', i + 1)
                if (end > i) { withStyle(SpanStyle(fontFamily = FontFamily.Monospace, color = codeColor, background = Color(0x33223654))) { append(text.substring(i + 1, end)) }; i = end + 1 } else { append(text[i]); i++ }
            }
            text[i] == '*' || text[i] == '_' -> {
                val c = text[i]
                val end = text.indexOf(c, i + 1)
                if (end > i + 1 && !text[i + 1].isWhitespace()) { withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text.substring(i + 1, end)) }; i = end + 1 } else { append(text[i]); i++ }
            }
            text.startsWith("![", i) -> {
                // Una imagen dentro de un texto corrido (una lista, un título): solo su descripción.
                val close = text.indexOf("](", i)
                val end = if (close > 0) text.indexOf(')', close) else -1
                if (close > i && end > close) { withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(text.substring(i + 2, close).ifBlank { "imagen" }) }; i = end + 1 } else { append(text[i]); i++ }
            }
            text[i] == '[' -> {
                val close = text.indexOf("](", i)
                val end = if (close > 0) text.indexOf(')', close) else -1
                if (close > i && end > close) { withStyle(SpanStyle(color = Orbita.Accent)) { append(text.substring(i + 1, close)) }; i = end + 1 } else { append(text[i]); i++ }
            }
            else -> { append(text[i]); i++ }
        }
    }
}

@Composable
fun MarkdownText(markdown: String, modifier: Modifier = Modifier, color: Color = Orbita.Text, body: TextStyle = MaterialTheme.typography.bodyLarge) {
    val blocks = remember(markdown) { parse(markdown) }
    Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        blocks.forEach { b ->
            when (b) {
                is Block.Image -> MarkdownImage(b.alt, b.url)
                is Block.Heading -> Text(
                    inline(b.text),
                    color = color,
                    style = when (b.level) { 1 -> MaterialTheme.typography.titleLarge; 2 -> MaterialTheme.typography.titleMedium; else -> MaterialTheme.typography.titleSmall },
                    modifier = Modifier.padding(top = 4.dp),
                )
                is Block.Paragraph -> Text(inline(b.text), color = color, style = body)
                is Block.Bullet -> Row(Modifier.padding(start = (b.indent * 14).dp)) {
                    Text(b.marker, color = Orbita.Accent, style = body, modifier = Modifier.width(22.dp))
                    Text(inline(b.text), color = color, style = body)
                }
                is Block.Code -> Text(
                    b.text,
                    color = Color(0xFFD5E3F5),
                    style = Mono,
                    softWrap = false,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color(0x66070D1A)).horizontalScroll(rememberScrollState()).padding(12.dp),
                )
                is Block.Quote -> Text(inline(b.text), color = Orbita.TextSoft, style = body, fontStyle = FontStyle.Italic, modifier = Modifier.padding(start = 10.dp))
                Block.Rule -> androidx.compose.foundation.layout.Box(Modifier.fillMaxWidth().padding(vertical = 4.dp).background(Color(0x26B4CCF5)).padding(top = 1.dp))
            }
        }
    }
}

/** Una imagen del mensaje: se baja del ordenador al verse y, al pulsarla, se abre a pantalla completa. */
@Composable
private fun MarkdownImage(alt: String, url: String) = ProjectImage(url, alt)

/**
 * Una imagen del proyecto por la ruta con que la nombró el agente (relativa o absoluta del ordenador): se pide al
 * ordenador al verse, se guarda y, al pulsarla, se abre a pantalla completa. Con [crop] llena su espacio recortándose.
 */
@Composable
fun ProjectImage(url: String, alt: String, modifier: Modifier = Modifier.fillMaxWidth(), crop: Boolean = false) {
    val images = LocalMarkdownImages.current
    val remote = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")
    val key = "img:$url"
    if (images == null || remote) {
        // Sin modelo (vistas previas) o de internet: la descripción, que al menos dice qué es.
        Text(alt.ifBlank { "imagen" }, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, fontStyle = FontStyle.Italic)
        return
    }
    val model = images.model
    val preview = model.previews[key]
    LaunchedEffect(key) {
        if (model.previews.containsKey(key)) return@LaunchedEffect
        model.previews[key] = Preview.Loading
        model.previews[key] = model.controller.fetchFile("project", url).fold(
            { raw ->
                withContext(Dispatchers.Default) {
                    if (!raw.isImage) return@withContext Preview.None("No es una imagen")
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size, bounds)
                    var sample = 1
                    while (bounds.outWidth / sample > 1440) sample *= 2
                    BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                        ?.let { Preview.Picture(it.asImageBitmap()) } ?: Preview.None("Imagen ilegible")
                }
            },
            { Preview.None(it.message) },
        )
    }
    when (preview) {
        is Preview.Picture -> Image(
            preview.image,
            contentDescription = alt.ifBlank { null },
            contentScale = if (crop) ContentScale.Crop else ContentScale.FillWidth,
            modifier = modifier
                .clip(RoundedCornerShape(14.dp))
                .clickable { model.viewer = ViewerTarget.File("project", url, alt.ifBlank { url.substringAfterLast('/').substringAfterLast('\\') }, "image") },
        )
        is Preview.None -> Text(
            (alt.ifBlank { "imagen" }) + (preview.reason?.let { " — no se pudo cargar" } ?: ""),
            color = Orbita.TextSoft,
            style = MaterialTheme.typography.bodySmall,
            fontStyle = FontStyle.Italic,
        )
        else -> androidx.compose.foundation.layout.Box(modifier.heightIn(min = 80.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
            CircularProgressIndicator(color = Orbita.Accent, strokeWidth = 2.dp, modifier = Modifier.width(24.dp))
        }
    }
}
