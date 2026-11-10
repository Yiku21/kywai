package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.I18n
import com.aicowork.remote.i18n.t

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddPhotoAlternate
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.GraphicEq
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.PersonAdd
import androidx.compose.material.icons.outlined.PersonOutline
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.SentimentSatisfied
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.unit.dp
import com.aicowork.remote.R
import com.aicowork.remote.data.model.Snapshot
import com.aicowork.remote.data.model.VideoCharacter
import com.aicowork.remote.data.model.VideoCharacterInput
import com.aicowork.remote.data.model.VideoImage
import com.aicowork.remote.data.model.VideoPickerInfo
import com.aicowork.remote.data.model.VideoStyle
import com.aicowork.remote.data.model.VideoVoice
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.Normalizer
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Lo elegido al escribir «/video»: el tipo de vídeo, el personaje, el estilo de animación y la voz. Va en el texto
 * como marcas («tipo:mixto personaje:robots-kywai estilo:watercolor voz:edge-es-MX-JorgeNeural»), igual que en el
 * escritorio (src/shared/videoChoice.ts): lo de por defecto no lleva marca.
 */
data class VideoChoice(val kind: String = "rapido", val character: String? = null, val style: String? = null, val voice: String? = null)

/** Las marcas de «/video» en el texto, como src/shared/videoChoice.ts (si cambian allí, cambian aquí). */
object VideoTags {
    val KINDS = listOf("rapido", "presentador", "mixto")
    const val ROBOTS = "robots-kywai"
    const val NO_CHARACTER = "ninguno"
    /** El estilo pintado a mano: sin marca de personaje lleva los robots. */
    const val KYWAI_FILM = "kywai-pintado"

    private fun tag(name: String) = Regex("(^|\\s)$name:([a-z0-9-]+)(?=\\s|$)", RegexOption.IGNORE_CASE)
    private val KIND = tag("tipo")
    private val CHARACTER = tag("personaje")
    private val STYLE = tag("estilo")
    private val VOICE = Regex("(^|\\s)voz:([a-z0-9_-]+)(?=\\s|$)", RegexOption.IGNORE_CASE)
    private val CHARACTER_ID = Regex("^[a-z0-9][a-z0-9-]{0,63}$")
    private val COMMAND = Regex("^/v[ií]deo(?=\\s|$)", RegexOption.IGNORE_CASE)
    private val HEAD = Regex("^(\\s*/v[ií]deo)(\\s*)([\\s\\S]*)$", RegexOption.IGNORE_CASE)
    private val JUST_STARTED = Regex("^\\s*/v[ií]deo\\s$", RegexOption.IGNORE_CASE)

    fun isVideoCommand(text: String): Boolean = COMMAND.containsMatchIn(text.trimStart())

    /** «/video » recién escrito (o elegido en la lista del «/»): el selector se abre solo. */
    fun justStarted(text: String): Boolean = JUST_STARTED.matches(text)

    /** Lo marcado en el texto. [styles]: los estilos que existen (null si aún no se saben: vale cualquiera). */
    fun choiceOf(text: String, styles: Set<String>? = null): VideoChoice {
        val k = KIND.find(text)?.groupValues?.get(2)?.lowercase()
        val s = STYLE.find(text)?.groupValues?.get(2)?.lowercase()
        val c = CHARACTER.find(text)?.groupValues?.get(2)?.lowercase()
        val kind = if (k in KINDS) k!! else if (s == "cartoon") "presentador" else "rapido"
        val style = s?.takeIf { it != "cartoon" && it != "dinamico" && (styles == null || it in styles) }
        val character = when {
            c != null && c != NO_CHARACTER && CHARACTER_ID.matches(c) -> c
            c == null && style == KYWAI_FILM -> ROBOTS
            else -> null
        }
        val voice = VOICE.find(text)?.groupValues?.get(2)
        return VideoChoice(kind, character, style, voice)
    }

    /** Quita las marcas, cada una con su espacio de delante. */
    fun strip(text: String): String {
        var out = text
        for (re in listOf(KIND, CHARACTER, STYLE, VOICE)) repeat(3) { if (re.containsMatchIn(out)) out = re.replaceFirst(out, "") }
        return out
    }

    /** Pone (o cambia) las marcas justo detrás de «/video». */
    fun withChoice(text: String, choice: VideoChoice): String {
        val m = HEAD.find(strip(text)) ?: return text
        val rest = m.groupValues[3].trimStart()
        val tags = listOfNotNull(
            choice.kind.takeIf { it != "rapido" }?.let { "tipo:$it" },
            choice.character?.let { "personaje:$it" } ?: if (choice.style == KYWAI_FILM) "personaje:$NO_CHARACTER" else null,
            choice.style?.let { "estilo:$it" },
            choice.voice?.let { "voz:$it" },
        )
        return m.groupValues[1] + " " + tags.joinToString("") { "$it " } + rest
    }
}

private data class Kind(val id: String, val icon: ImageVector, val name: () -> String, val line: () -> String)

private val KINDS = listOf(
    Kind("rapido", Icons.Outlined.Movie, { t("Rápido: texto animado") }, { t("Frases grandes con ritmo, al compás de la voz.") }),
    Kind("presentador", Icons.Outlined.SentimentSatisfied, { t("Dibujos con presentador") }, { t("Un personaje dibujado lo explica, con humor.") }),
    Kind("mixto", Icons.Outlined.Layers, { t("Mixto") }, { t("El presentador y golpes de texto grande, alternados.") }),
)

// Los nombres y las líneas de los estilos llegan en español y en inglés (en otros idiomas, el inglés).
private fun es() = I18n.lang == "es"
private fun styleName(f: VideoStyle) = if (es() || f.en.isBlank()) f.name else f.en
private fun styleLine(f: VideoStyle) = if (es() || f.lineEn.isBlank()) f.line else f.lineEn
private fun charName(c: VideoCharacter) = if (c.builtin) t("Robots de kywai") else c.name
private fun kindName(id: String) = (KINDS.firstOrNull { it.id == id } ?: KINDS[0]).name()

private fun langName(code: String?): String {
    if (code.isNullOrBlank()) return ""
    val n = Locale.forLanguageTag(code).getDisplayLanguage(I18n.locale)
    return if (n.isBlank()) code else n.replaceFirstChar { it.titlecase(I18n.locale) }
}

private fun voiceName(v: VideoVoice) = if (v.engine == "sistema") t("Voz del sistema") else v.name

/** Lo que se ve debajo del nombre de una voz: de dónde es, su motor y si es de hombre o de mujer. */
private fun voiceLine(v: VideoVoice): String = listOf(
    when {
        v.engine == "kokoro" && v.line == "Kokoro" -> ""
        v.engine == "sistema" -> t("La del sistema operativo")
        else -> when (v.line) {
            "España" -> t("España")
            "México" -> t("México")
            "Estados Unidos" -> t("Estados Unidos")
            "Reino Unido" -> t("Reino Unido")
            "Tu voz clonada" -> t("Tu voz clonada")
            else -> v.line
        }
    },
    when {
        v.engine == "edge" -> "Microsoft Edge"
        v.engine == "mac" -> t("Siri (Mac)")
        v.engine == "kokoro" && v.line != "Kokoro" -> "Kokoro"
        else -> ""
    },
    if (v.engine in listOf("gemini", "edge", "mac") || (v.engine == "kokoro" && v.line != "Kokoro")) "" else langName(v.lang),
    when (v.gender) { "f" -> t("voz de mujer"); "m" -> t("voz de hombre"); else -> "" },
).filter { it.isNotBlank() }.joinToString(" · ")

private fun foldText(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase()

private val MISSING: Map<String, () -> String> = mapOf(
    "voicebox" to { t("Abre Voicebox para usar tus propias voces (o la tuya, clonada).") },
    "gemini" to { t("Con una clave de API de Gemini tendrás 12 voces más.") },
    "kokoro" to { t("Instala Kokoro (gratis) en Ajustes → Extensiones → Estudio de vídeo para tener voces sin internet.") },
)

/**
 * La barra «Vídeo · lo elegido» encima del cuadro del chat mientras se escribe «/video …». Al tocarla se abre el
 * selector; al escribir «/video » (o elegirlo en la lista del «/») se abre solo.
 */
@Composable
fun VideoPickerBar(model: OrbitaModel, snapshot: Snapshot?) {
    if (snapshot?.capabilities?.videoPicker != true) return
    val text = model.chatDraft.text
    if (!VideoTags.isVideoCommand(text) || com.aicowork.remote.ui.orbita.TemplateRules.commandQuery(text) != null) return
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(text) {
        if (VideoTags.justStarted(text)) {
            keyboard?.hide()
            model.videoPickerOpen = true
        }
    }
    val info = model.videoPicker
    val choice = VideoTags.choiceOf(text, info?.styles?.map { it.slug }?.toSet())
    val style = choice.style?.let { s -> info?.styles?.firstOrNull { it.slug == s } }
    val character = choice.character?.let { c -> info?.characters?.firstOrNull { it.id == c } }
    val voiceId = choice.voice ?: info?.defaultVoice
    val voice = voiceId?.let { v -> info?.voices?.firstOrNull { it.id == v } }
    val summary = listOfNotNull(
        kindName(choice.kind),
        choice.character?.let { character?.let(::charName) ?: if (it == VideoTags.ROBOTS) t("Robots de kywai") else t("Personaje") },
        style?.let(::styleName) ?: if (choice.style != null) choice.style else t("Estilo de kywai"),
        voice?.let(::voiceName) ?: if (choice.voice != null) t("Voz elegida") else null,
    )
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp)
            .card(radius = 18.dp)
            .tappable(haptic = Haptic.Tap) { keyboard?.hide(); model.videoPickerOpen = true }
            .padding(start = 8.dp, end = 12.dp, top = 6.dp, bottom = 6.dp)
            .semantics { role = Role.Button }
            .testTag("video-bar"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val thumb = choice.style?.let { model.videoThumbs[it] }
        Box(Modifier.size(width = 44.dp, height = 28.dp).clip(RoundedCornerShape(8.dp)).background(Orbita.AccentSoft), contentAlignment = Alignment.Center) {
            if (thumb != null) Image(thumb, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            else Icon(KINDS.firstOrNull { it.id == choice.kind }?.icon ?: Icons.Outlined.Movie, null, tint = Orbita.Accent, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(10.dp))
        Text(t("Vídeo"), color = Orbita.Accent, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.width(8.dp))
        Text(summary.joinToString(" · "), color = Orbita.Text, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
        Icon(Icons.Outlined.ExpandMore, contentDescription = t("Elegir tipo, personaje, estilo y voz"), tint = Orbita.TextSoft, modifier = Modifier.size(20.dp))
    }
}

/** Pide al ordenador la muestra de un estilo (una vez) y la guarda en el modelo. */
@Composable
private fun rememberThumb(model: OrbitaModel, f: VideoStyle): ImageBitmap? {
    LaunchedEffect(f.slug) {
        if (!f.thumb || model.videoThumbs.containsKey(f.slug)) return@LaunchedEffect
        model.videoThumbs[f.slug] = null
        model.controller.videoStyleThumb(f.slug).onSuccess { raw ->
            val img = withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(raw.bytes, 0, raw.bytes.size)?.asImageBitmap() }
            model.videoThumbs[f.slug] = img
        }.onFailure { model.videoThumbs.remove(f.slug) }
    }
    return model.videoThumbs[f.slug]
}

/** Una miniatura en data: URL (la de un personaje). */
private fun dataImage(url: String): ImageBitmap? = runCatching {
    val b64 = url.substringAfter("base64,", "")
    if (b64.isEmpty()) return null
    val bytes = Base64.decode(b64, Base64.DEFAULT)
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
}.getOrNull()

/** Suena la muestra de una voz (el MP3 que hace el ordenador), guardada en la caché para no pedirla otra vez. */
private class SamplePlayer(private val dir: File) {
    var playing by mutableStateOf<String?>(null)
    var loading by mutableStateOf<String?>(null)
    private var player: MediaPlayer? = null

    fun cached(id: String) = File(dir, id.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".mp3").takeIf { it.isFile && it.length() > 0 }

    fun save(id: String, base64: String): File {
        dir.mkdirs()
        return File(dir, id.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".mp3").apply { writeBytes(Base64.decode(base64, Base64.DEFAULT)) }
    }

    fun play(id: String, file: File) {
        stop()
        val p = MediaPlayer()
        player = p
        playing = id
        runCatching {
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            p.setDataSource(file.absolutePath)
            p.setOnCompletionListener { if (player === it) stop() }
            p.setOnErrorListener { mp, _, _ -> if (player === mp) stop(); true }
            p.setOnPreparedListener { if (player === it) it.start() }
            p.prepareAsync()
        }.onFailure { stop() }
    }

    fun stop() {
        player?.let { runCatching { it.release() } }
        player = null
        playing = null
    }
}

/**
 * El selector de «/video» a pantalla casi completa: los cuatro pasos del escritorio (tipo, personaje, estilo con su
 * muestra y voz con ▶ para oírla). Cada elección cambia las marcas del mensaje que se está escribiendo.
 */
@Composable
fun VideoPickerSheet(model: OrbitaModel) {
    var error by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sample = remember { SamplePlayer(File(context.cacheDir, "muestras-voz")) }
    var voiceError by remember { mutableStateOf<Pair<String, String>?>(null) }
    DisposableEffect(Unit) { onDispose { sample.stop() } }
    LaunchedEffect(Unit) {
        model.controller.videoPicker().fold({ model.videoPicker = it; error = null }, { if (model.videoPicker == null) error = it.message ?: t("No se pudo consultar el ordenador") })
    }
    val info: VideoPickerInfo? = model.videoPicker
    val text = model.chatDraft.text
    val choice = VideoTags.choiceOf(text, info?.styles?.map { it.slug }?.toSet())
    val scroll = rememberScrollState()
    fun set(next: VideoChoice) {
        val updated = VideoTags.withChoice(model.chatDraft.text, next)
        model.chatDraft = TextFieldValue(updated, selection = TextRange(updated.length))
    }
    fun close() {
        sample.stop()
        model.videoPickerOpen = false
    }
    fun preview(v: VideoVoice) {
        if (sample.playing == v.id || sample.loading == v.id) { sample.stop(); sample.loading = null; return }
        voiceError = null
        sample.cached(v.id)?.let { sample.play(v.id, it); return }
        sample.stop()
        sample.loading = v.id
        scope.launch {
            model.controller.videoVoicePreview(v.id).fold(
                { p ->
                    val file = withContext(Dispatchers.IO) { sample.save(v.id, p.data) }
                    if (sample.loading == v.id) { sample.loading = null; sample.play(v.id, file) }
                },
                { e ->
                    if (sample.loading == v.id) sample.loading = null
                    voiceError = v.id to (e.message ?: t("No se pudo preparar la muestra"))
                },
            )
        }
    }

    Column(Modifier.fillMaxWidth().widthIn(max = 860.dp).fillMaxHeight().glass(radius = 30.dp, tint = Orbita.GlassSolid).testTag("video-picker")) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 8.dp, top = 12.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Movie, null, tint = Orbita.Accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(if (adding) t("Agregar personaje") else t("¿Cómo quieres el vídeo?"), color = Orbita.Text, style = MaterialTheme.typography.titleMedium)
                if (!adding) Text(t("Elige y luego escribe de qué va"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            }
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { if (adding) adding = false else close() })
        }
        if (adding) {
            AddCharacter(model, onCancel = { adding = false }) { id, list ->
                model.videoPicker = model.videoPicker?.copy(characters = list)
                adding = false
                set(choice.copy(character = id))
            }
            return@Column
        }
        Column(Modifier.weight(1f).verticalScroll(scroll).padding(horizontal = 14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            error?.let { Text(it, color = Orbita.Warn, style = MaterialTheme.typography.bodySmall) }

            Step(1, t("Tipo de vídeo"))
            Grid(KINDS, minCell = 150.dp) { k ->
                PickCard(
                    selected = choice.kind == k.id,
                    title = k.name(),
                    line = k.line(),
                    tag = "video-kind-${k.id}",
                    thumb = { IconThumb(k.icon) },
                ) { set(choice.copy(kind = k.id)) }
            }

            Step(2, t("Personaje"))
            val chars = info?.characters.orEmpty()
            val charCells: List<VideoCharacter?> = listOf<VideoCharacter?>(null) + chars + listOf(VideoCharacter(id = "+", name = ""))
            Grid(charCells, minCell = 150.dp) { c ->
                when {
                    c == null -> PickCard(choice.character == null, t("Ninguno (genérico)"), t("Sin personaje fijo: kywai pone el que pida el tema."), "video-character-none", { IconThumb(Icons.Outlined.PersonOutline) }) {
                        set(choice.copy(character = null))
                    }
                    c.id == "+" -> PickCard(false, t("Agregar personaje"), t("Con una descripción, imágenes o ambas; queda guardado."), "video-character-add", { IconThumb(Icons.Outlined.PersonAdd) }) {
                        adding = true
                    }
                    else -> Box {
                        PickCard(
                            selected = choice.character == c.id,
                            title = charName(c),
                            line = if (c.builtin) t("Hermes, Claude y Codex, en el estilo que elijas.") else c.description.ifBlank { if (c.images == 1) t("1 imagen") else t("{n} imágenes", "n" to c.images) },
                            tag = "video-character-${c.id}",
                            thumb = { CharacterThumb(c) },
                        ) { set(choice.copy(character = c.id)) }
                        if (!c.builtin) {
                            var busy by remember { mutableStateOf(false) }
                            IconAction(
                                Icons.Outlined.DeleteOutline,
                                t("Borrar el personaje «{name}»", "name" to c.name),
                                onClick = {
                                    busy = true
                                    scope.launch {
                                        model.controller.deleteVideoCharacter(c.id).fold(
                                            { list ->
                                                model.videoPicker = model.videoPicker?.copy(characters = list)
                                                if (choice.character == c.id) set(VideoTags.choiceOf(model.chatDraft.text).copy(character = null))
                                                model.toast(t("Personaje «{name}» borrado", "name" to c.name))
                                            },
                                            { e -> model.toast(e.message ?: t("No se pudo borrar"), Toast.Tone.Error) },
                                        )
                                        busy = false
                                    }
                                },
                                enabled = !busy,
                                size = 36.dp,
                                modifier = Modifier.align(Alignment.TopEnd),
                            )
                        }
                    }
                }
            }

            Step(3, t("Estilo de animación"))
            OrbitaField(query, { query = it }, t("Buscar estilo (acuarela, píxel, anime…)"), leading = Icons.Outlined.Search, modifier = Modifier.testTag("video-style-search"))
            val needle = foldText(query.trim())
            val quickHit = needle.isEmpty() || needle in foldText(t("El de kywai (rápido)"))
            if (quickHit) Grid(listOf(Unit), minCell = 150.dp) {
                PickCard(choice.style == null, t("El de kywai (rápido)"), t("Listo en unos minutos, con las imágenes y la voz de kywai."), "video-style-kywai", { IconThumb(Icons.Outlined.AutoAwesome) }) {
                    set(choice.copy(style = null))
                }
            }
            val styles = info?.styles.orEmpty().filter { f -> needle.isEmpty() || listOf(f.name, f.en, f.line, f.lineEn, f.slug).any { needle in foldText(it) } }
            if (info == null && error == null) Text(t("Preguntando al ordenador…"), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
            for (cat in info?.categories.orEmpty()) {
                val list = styles.filter { it.category == cat.id }
                if (list.isEmpty()) continue
                Text(if (es() || cat.en.isBlank()) cat.name else cat.en, color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 4.dp))
                Grid(list, minCell = 150.dp) { f ->
                    PickCard(
                        selected = choice.style == f.slug,
                        title = styleName(f),
                        line = styleLine(f),
                        tag = "video-style-${f.slug}",
                        badge = when { f.needs == "material" -> t("Con material real"); f.base != null -> t("Estilo de kywai"); else -> null },
                        thumb = { StyleThumb(model, f) },
                    ) { set(choice.copy(style = f.slug)) }
                }
            }
            if (info != null && styles.isEmpty() && !quickHit) Text(t("Ningún estilo se llama así."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)

            Step(4, t("Voz"))
            val voices = info?.voices.orEmpty()
            val defaultVoice = info?.defaultVoice
            val current = choice.voice ?: defaultVoice
            if (info != null && defaultVoice == null) Grid(listOf(Unit), minCell = 150.dp) {
                PickCard(choice.voice == null, t("Automática"), t("La mejor que haya: tu voz de Voicebox, Gemini o Kokoro."), "video-voice-auto", { IconThumb(Icons.Outlined.GraphicEq) }) {
                    set(choice.copy(voice = null))
                }
            }
            // Con voces elegidas por idioma, un grupo por idioma (primero el de la app); si no, uno por motor.
            val groups: List<Pair<String, List<VideoVoice>>> = if (defaultVoice != null) {
                voices.mapNotNull { it.lang }.distinct().map { l -> langName(l) to voices.filter { it.lang == l } }
            } else listOf(
                "voicebox" to t("Tus voces (Voicebox)"), "gemini" to "Gemini", "kokoro" to "Kokoro", "sistema" to t("Sistema"),
            ).map { (e, name) -> name to voices.filter { it.engine == e } }
            for ((title, list) in groups) {
                if (list.isEmpty()) continue
                Text(title, color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 4.dp))
                Grid(list, minCell = 200.dp) { v ->
                    val err = voiceError?.takeIf { it.first == v.id }?.second
                    VoiceCard(
                        v = v,
                        selected = current == v.id,
                        line = err ?: voiceLine(v),
                        failed = err != null,
                        state = when (v.id) { sample.loading -> 1; sample.playing -> 2; else -> 0 },
                        onPlay = { preview(v) },
                    ) { set(choice.copy(voice = if (v.id == defaultVoice) null else v.id)) }
                }
            }
            info?.missing?.mapNotNull { MISSING[it] }?.takeIf { it.isNotEmpty() }?.let { notes ->
                Text(notes.joinToString(" ") { it() }, color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall)
            }
            Text(
                t("Los estilos de película los dirige un agente con terminal y tardan más (de 20 minutos a una hora)."),
                color = Orbita.TextFaint,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
            )
        }
        Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.End) {
            OrbitaButton(t("Listo: escribe de qué va"), onClick = { close() }, modifier = Modifier.testTag("video-picker-done"), haptic = Haptic.Tap, height = 46.dp)
        }
    }
}

@Composable
private fun Step(n: Int, title: String) {
    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(Orbita.AccentSoft), contentAlignment = Alignment.Center) {
            Text("$n", color = Orbita.Accent, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.width(8.dp))
        Text(title, color = Orbita.Text, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
    }
}

/** Rejilla de tarjetas: tantas columnas como quepan (dos como mínimo). */
@Composable
private fun <T> Grid(items: List<T>, minCell: androidx.compose.ui.unit.Dp, cell: @Composable (T) -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val cols = (maxWidth / minCell).toInt().coerceAtLeast(2)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items.chunked(cols).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { Box(Modifier.weight(1f)) { cell(it) } }
                    repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun PickCard(
    selected: Boolean,
    title: String,
    line: String,
    tag: String,
    thumb: @Composable () -> Unit,
    badge: String? = null,
    onClick: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .card(radius = 16.dp, selected = selected)
            .tappable(haptic = Haptic.Select, onClick = onClick)
            .semantics { role = Role.RadioButton; this.selected = selected }
            .padding(8.dp)
            .testTag(tag),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(10.dp)).background(Orbita.AccentSoft), contentAlignment = Alignment.Center) {
            thumb()
            if (selected) Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.align(Alignment.TopStart).padding(4.dp).size(18.dp).clip(CircleShape).background(Orbita.GlassSolid))
        }
        Spacer(Modifier.height(6.dp))
        Text(title, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (line.isNotBlank()) Text(line, color = Orbita.TextSoft, style = MaterialTheme.typography.labelSmall, maxLines = 3, overflow = TextOverflow.Ellipsis)
        badge?.let {
            Spacer(Modifier.height(4.dp))
            Text(it, color = Orbita.Accent, style = MaterialTheme.typography.labelSmall, modifier = Modifier.clip(RoundedCornerShape(6.dp)).background(Orbita.AccentSoft).padding(horizontal = 6.dp, vertical = 2.dp))
        }
    }
}

@Composable
private fun IconThumb(icon: ImageVector) = Icon(icon, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(28.dp))

@Composable
private fun StyleThumb(model: OrbitaModel, f: VideoStyle) {
    val img = rememberThumb(model, f)
    if (img != null) Image(img, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    else Icon(Icons.Outlined.Movie, contentDescription = null, tint = Orbita.TextFaint, modifier = Modifier.size(22.dp))
}

@Composable
private fun CharacterThumb(c: VideoCharacter) {
    if (c.builtin) {
        Row(horizontalArrangement = Arrangement.spacedBy((-10).dp), verticalAlignment = Alignment.CenterVertically) {
            for (r in listOf(R.drawable.robot_hermes, R.drawable.robot_claude, R.drawable.robot_codex)) {
                Image(androidx.compose.ui.res.painterResource(r), contentDescription = null, modifier = Modifier.size(40.dp))
            }
        }
        return
    }
    val img = remember(c.thumb) { if (c.thumb.isBlank()) null else dataImage(c.thumb) }
    if (img != null) Image(img, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    else Text(c.name.take(1).uppercase(), color = Orbita.Accent, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
}

/** Una voz: el nombre y de dónde es, y ▶ a la derecha para oír una frase con ella. state: 0 parada, 1 preparando, 2 sonando. */
@Composable
private fun VoiceCard(v: VideoVoice, selected: Boolean, line: String, failed: Boolean, state: Int, onPlay: () -> Unit, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .card(radius = 16.dp, selected = selected)
            .tappable(haptic = Haptic.Select, onClick = onClick)
            .semantics { role = Role.RadioButton; this.selected = selected }
            .padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp)
            .testTag("video-voice-${v.id}"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(voiceName(v), color = Orbita.Text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, maxLines = 1)
                if (selected) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(16.dp))
                }
            }
            Text(line, color = if (failed) Orbita.Warn else Orbita.TextSoft, style = MaterialTheme.typography.labelSmall, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .tappable(haptic = Haptic.Tap, onClick = onPlay)
                .semantics { contentDescription = if (state > 0) t("Parar") else t("Escuchar la voz «{name}»", "name" to voiceName(v)) }
                .testTag("video-voice-play-${v.id}"),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.size(32.dp).clip(CircleShape).background(if (state > 0) Orbita.Accent else Orbita.AccentSoft), contentAlignment = Alignment.Center) {
                when (state) {
                    1 -> CircularProgressIndicator(color = Orbita.Night, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                    2 -> Icon(Icons.Outlined.Stop, null, tint = Orbita.Night, modifier = Modifier.size(18.dp))
                    else -> Icon(Icons.Outlined.PlayArrow, null, tint = Orbita.Accent, modifier = Modifier.size(20.dp))
                }
            }
        }
    }
}

/** Reduce una foto a [max] px como mucho, en JPEG (el cuerpo de la petición no puede pasar de 256 KiB). */
private fun shrink(context: Context, uri: Uri, max: Int, quality: Int, square: Boolean = false): ByteArray? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= max && bounds.outHeight / (sample * 2) >= max) sample *= 2
    val src = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return null
    val out = if (square) {
        val side = minOf(src.width, src.height)
        Bitmap.createScaledBitmap(Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side), max, max, true)
    } else {
        val k = minOf(1f, max.toFloat() / maxOf(src.width, src.height))
        Bitmap.createScaledBitmap(src, (src.width * k).toInt().coerceAtLeast(1), (src.height * k).toInt().coerceAtLeast(1), true)
    }
    ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
}.getOrNull()

private const val MAX_PHOTOS = 4

/** «Agregar personaje»: nombre, y descripción, fotos o las dos cosas. Se guarda en el ordenador para todos los proyectos. */
@Composable
private fun AddCharacter(model: OrbitaModel, onCancel: () -> Unit, onDone: (String, List<VideoCharacter>) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf("") }
    var about by remember { mutableStateOf("") }
    val photos = remember { mutableStateListOf<Uri>() }
    val previews = remember { mutableStateListOf<ImageBitmap?>() }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_PHOTOS)) { uris ->
        val room = MAX_PHOTOS - photos.size
        uris.take(room).forEach { uri ->
            photos += uri
            previews += shrink(context, uri, 192, 80, square = true)?.let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() }
        }
    }
    val ready = name.isNotBlank() && (about.isNotBlank() || photos.isNotEmpty())
    fun save() {
        busy = true
        error = null
        scope.launch {
            val input = withContext(Dispatchers.Default) {
                // Cuantas más fotos, más pequeñas: todo junto tiene que caber en una petición.
                var quality = 82
                var images: List<VideoImage>
                do {
                    images = photos.mapIndexedNotNull { i, uri -> shrink(context, uri, 640, quality)?.let { VideoImage("foto-${i + 1}.jpg", Base64.encodeToString(it, Base64.NO_WRAP)) } }
                    quality -= 12
                } while (images.sumOf { it.data.length } > 200_000 && quality > 30)
                val thumb = photos.firstOrNull()?.let { shrink(context, it, 192, 80, square = true) }?.let { Base64.encodeToString(it, Base64.NO_WRAP) }
                VideoCharacterInput(name.trim(), about.trim(), images, thumb)
            }
            model.controller.addVideoCharacter(input).fold(
                { r ->
                    model.feedback.confirm()
                    onDone(r.id, r.characters)
                },
                { e ->
                    model.feedback.reject()
                    error = e.message ?: t("No se pudo guardar el personaje")
                },
            )
            busy = false
        }
    }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp).testTag("video-add-character"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(t("Cuéntalo con palabras, con imágenes o con las dos cosas. Se guarda para usarlo en todos tus vídeos y se dibuja en el estilo que elijas."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall)
        Text(t("Nombre"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge)
        OrbitaField(name, { name = it.take(60) }, t("Por ejemplo: Doña Rosa"), autoFocus = true, modifier = Modifier.testTag("video-character-name"))
        Text(t("Cómo es"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge)
        OrbitaField(
            about,
            { about = it.take(1500) },
            t("Por ejemplo: una abuela panadera, bajita, con moño gris, gafas redondas y delantal azul; muy risueña."),
            singleLine = false,
            minLines = 3,
            modifier = Modifier.testTag("video-character-about"),
        )
        Text(t("Fotos (hasta {n})", "n" to MAX_PHOTOS), color = Orbita.TextSoft, style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            previews.forEachIndexed { i, img ->
                Box(Modifier.size(64.dp).clip(RoundedCornerShape(12.dp)).background(Orbita.AccentSoft)) {
                    if (img != null) Image(img, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    IconAction(Icons.Outlined.Close, t("Quitar"), onClick = { photos.removeAt(i); previews.removeAt(i) }, size = 28.dp, tint = Orbita.Text, modifier = Modifier.align(Alignment.TopEnd).offset(x = 2.dp, y = (-2).dp))
                }
            }
            if (photos.size < MAX_PHOTOS) {
                Column(
                    Modifier.size(64.dp).card(radius = 12.dp).tappable(haptic = Haptic.Tap) {
                        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    }.testTag("video-character-photos"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Icon(Icons.Outlined.AddPhotoAlternate, null, tint = Orbita.Accent, modifier = Modifier.size(22.dp))
                    Text(t("Añadir"), color = Orbita.TextSoft, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        error?.let { Text(it, color = Orbita.Warn, style = MaterialTheme.typography.bodySmall) }
        Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.End)) {
            OrbitaButton(t("Cancelar"), onClick = onCancel, style = ButtonStyle.Ghost, enabled = !busy, haptic = Haptic.Tap, height = 44.dp)
            OrbitaButton(if (busy) t("Guardando…") else t("Guardar personaje"), onClick = { save() }, enabled = ready && !busy, busy = busy, height = 44.dp, modifier = Modifier.testTag("video-character-save"))
        }
    }
}
