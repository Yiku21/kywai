package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.GraphicEq
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Radio
import androidx.compose.material.icons.outlined.SkipNext
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.model.MusicResult
import kotlinx.coroutines.delay

/**
 * Música del espacio, como el reproductor del escritorio pero solo con las fuentes sin anuncios: radios de SomaFM y
 * canciones de Audius. Suenan directamente desde sus servidores públicos; el ordenador solo busca.
 */
class MusicPlayer {
    var current by mutableStateOf<MusicResult?>(null)
        private set
    var playing by mutableStateOf(false)
        private set
    var buffering by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set
    /** Volumen de la música (0–1). */
    var volume by mutableFloatStateOf(0.6f)
        private set

    /** La lista de la que salió lo que suena (para pasar a la siguiente canción de Audius). */
    private var queue: List<MusicResult> = emptyList()
    private var player: MediaPlayer? = null

    fun play(item: MusicResult, list: List<MusicResult> = listOf(item)) {
        queue = list
        current = item
        error = null
        start(item)
    }

    private fun start(item: MusicResult) {
        release()
        buffering = true
        playing = false
        val p = MediaPlayer()
        player = p
        runCatching {
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
            p.setDataSource(item.stream)
            p.setVolume(volume, volume)
            p.setOnPreparedListener {
                if (player !== it) return@setOnPreparedListener
                buffering = false
                it.start()
                playing = true
            }
            p.setOnCompletionListener { if (player === it) next() }
            p.setOnErrorListener { mp, what, extra ->
                if (player === mp) {
                    Log.w("MusicPlayer", "No suena ${item.id}: $what/$extra")
                    buffering = false
                    playing = false
                    error = t("No se pudo reproducir «{title}»", "title" to item.title)
                }
                true
            }
            p.prepareAsync()
        }.onFailure {
            buffering = false
            error = t("No se pudo reproducir «{title}»", "title" to item.title)
        }
    }

    fun toggle() {
        val p = player
        when {
            current == null -> Unit
            p == null || error != null -> current?.let { start(it) }
            playing -> { runCatching { p.pause() }; playing = false }
            !buffering -> { runCatching { p.start() }; playing = true }
        }
    }

    /** La siguiente canción de la lista (las radios no tienen siguiente). */
    fun next() {
        val now = current ?: return
        if (now.live) return
        val i = queue.indexOfFirst { it.id == now.id }
        val following = queue.drop(i + 1).firstOrNull { !it.live } ?: run { playing = false; return }
        current = following
        start(following)
    }

    fun changeVolume(v: Float) {
        volume = v.coerceIn(0f, 1f)
        runCatching { player?.setVolume(volume, volume) }
    }

    /** Para del todo (al quitar la música o salir de la app). */
    fun stop() {
        release()
        playing = false
        buffering = false
        current = null
    }

    /** Al pasar la app a segundo plano: se pausa (no hay reproductor en segundo plano). */
    fun pause() {
        if (playing) toggle()
    }

    private fun release() {
        player?.let { runCatching { it.reset(); it.release() } }
        player = null
    }
}

/** Minirreproductor flotante: lo que suena, ▶/❚❚ y volumen. Tocar el título abre la música. */
@Composable
fun MiniPlayer(model: OrbitaModel, modifier: Modifier = Modifier, compact: Boolean = false) {
    val music = model.music
    val now = music.current ?: return
    Row(
        modifier.heightIn(min = 46.dp).glass(radius = 23.dp).padding(start = 12.dp, end = 4.dp).testTag("mini-player"),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.clip(RoundedCornerShape(16.dp)).tappable { model.musicOpen = true }.padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (now.live) Icons.Outlined.Radio else Icons.Outlined.MusicNote, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(18.dp))
            if (!compact) {
                Spacer(Modifier.width(8.dp))
                Text(now.title, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 200.dp))
            }
        }
        PlayButton(music)
        if (!compact) VolumeSlider(music, Modifier.width(96.dp))
    }
}

@Composable
private fun PlayButton(music: MusicPlayer) {
    if (music.buffering) {
        CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp), color = Orbita.Accent, strokeWidth = 2.dp)
    } else {
        IconAction(
            if (music.playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow,
            if (music.playing) t("Pausar") else t("Reproducir"),
            onClick = { music.toggle() },
            modifier = Modifier.testTag("music-toggle"),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VolumeSlider(music: MusicPlayer, modifier: Modifier = Modifier) {
    val colors = SliderDefaults.colors(thumbColor = Orbita.Text, activeTrackColor = Orbita.Accent, inactiveTrackColor = Orbita.Divider)
    val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }
    // Fino y sin marcas, como el del escritorio.
    Slider(
        value = music.volume,
        onValueChange = { music.changeVolume(it) },
        colors = colors,
        interactionSource = interaction,
        thumb = { SliderDefaults.Thumb(interaction, colors = colors, thumbSize = androidx.compose.ui.unit.DpSize(4.dp, 18.dp)) },
        track = { st -> SliderDefaults.Track(st, colors = colors, drawStopIndicator = null, thumbTrackGapSize = 2.dp, modifier = Modifier.height(4.dp)) },
        modifier = modifier.semantics { contentDescription = t("Volumen de la música") }.testTag("music-volume"),
    )
}

/** «Música»: radios de SomaFM o canciones de Audius (búsqueda en el ordenador), y lo que suena con su volumen. */
@Composable
fun MusicSheet(model: OrbitaModel) {
    val music = model.music
    var radio by remember { mutableStateOf(music.current?.live ?: true) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<MusicResult>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(radio, query) {
        val q = query.trim()
        if (!radio && q.length < 2) {
            results = emptyList(); error = null; loading = false
            return@LaunchedEffect
        }
        delay(if (q.isEmpty()) 0 else 350)
        loading = true
        model.controller.music(if (radio) "radio" else "audius", q)
            .onSuccess { results = it; error = null }
            .onFailure { error = it.message }
        loading = false
    }
    Column(Modifier.fillMaxWidth().widthIn(max = 640.dp).glass(radius = 30.dp, tint = Orbita.GlassSolid).padding(14.dp).testTag("music")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.MusicNote, null, tint = Orbita.TextSoft, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
            Text(t("Música"), color = Orbita.Text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.musicOpen = false })
        }
        Spacer(Modifier.size(8.dp))
        Segmented(
            options = listOf(true to t("Radios"), false to "Audius"),
            selected = radio,
            onSelect = { radio = it; query = "" },
        )
        Spacer(Modifier.size(8.dp))
        OrbitaField(
            value = query,
            onValueChange = { query = it.take(200) },
            placeholder = if (radio) t("Filtrar radios") else t("Buscar canciones en Audius"),
            imeAction = ImeAction.Search,
            onIme = {},
        )
        Spacer(Modifier.size(6.dp))
        when {
            loading && results.isEmpty() -> Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.Center) {
                CircularProgressIndicator(Modifier.size(22.dp), color = Orbita.Accent, strokeWidth = 2.dp)
            }
            error != null -> Text(error!!, color = Orbita.Danger, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            !radio && query.trim().length < 2 -> Text(t("Escribe un artista, un género o una canción."), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            results.isEmpty() && !loading -> Text(t("Nada con «{q}»", "q" to query.trim()), color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(12.dp))
            else -> LazyColumn(Modifier.heightIn(max = 380.dp)) {
                items(results, key = { it.id }) { item ->
                    val on = music.current?.id == item.id
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp))
                            .rowHighlight(on)
                            .tappable(haptic = Haptic.Select) { if (on) music.toggle() else music.play(item, results) }
                            .padding(horizontal = 10.dp, vertical = 10.dp)
                            .testTag("music-${item.id}"),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            when {
                                on && music.playing -> Icons.Outlined.GraphicEq
                                item.live -> Icons.Outlined.Radio
                                else -> Icons.Outlined.MusicNote
                            },
                            contentDescription = null,
                            tint = if (on) Orbita.Accent else Orbita.TextSoft,
                            modifier = Modifier.size(20.dp),
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(item.title, color = Orbita.Text, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val sub = listOfNotNull(item.artist.ifBlank { null }, item.detail?.ifBlank { null }).joinToString(" · ")
                            if (sub.isNotBlank()) Text(sub, color = Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        music.current?.let { now ->
            Spacer(Modifier.size(8.dp))
            Row(Modifier.fillMaxWidth().card(radius = 18.dp).padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                    Text(now.title, color = Orbita.Text, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(music.error ?: now.artist, color = if (music.error != null) Orbita.Danger else Orbita.TextSoft, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                PlayButton(music)
                if (!now.live) IconAction(Icons.Outlined.SkipNext, t("Siguiente"), onClick = { music.next() })
                IconAction(Icons.Outlined.Close, t("Quitar la música"), onClick = { music.stop() }, modifier = Modifier.testTag("music-stop"))
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Outlined.VolumeUp, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                VolumeSlider(music, Modifier.weight(1f))
            }
        }
    }
}
