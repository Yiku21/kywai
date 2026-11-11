package com.aicowork.remote.ui.orbita

import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import com.aicowork.remote.data.net.MediaStream
import com.aicowork.remote.i18n.t

/** Extensiones que el visor reproduce en vez de descargar enteras. */
private val VIDEO_EXT = setOf("mp4", "m4v", "webm", "mov", "mkv", "3gp")
private val AUDIO_EXT = setOf("mp3", "wav", "ogg", "opus", "m4a", "aac", "flac")

/** "video", "audio" o null según la extensión del nombre. */
fun mediaKind(name: String): String? = when (name.substringAfterLast('.', "").lowercase()) {
    in VIDEO_EXT -> "video"
    in AUDIO_EXT -> "audio"
    else -> null
}

/**
 * Reproductor de vídeo o audio del visor (Media3). Pide el archivo al ordenador por partes con el OkHttp de la app
 * (TLS fijado y token), así que empieza enseguida y se puede saltar a cualquier punto. [onFullscreen] recibe true
 * cuando se pulsa el botón de pantalla completa del propio reproductor.
 */
@OptIn(UnstableApi::class)
@Composable
fun StreamPlayer(stream: MediaStream, audio: Boolean, onFullscreen: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var error by remember(stream) { mutableStateOf<String?>(null) }
    val player = remember(stream) {
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(DefaultMediaSourceFactory(OkHttpDataSource.Factory(stream.client)))
            .build()
            .apply {
                setMediaItem(MediaItem.fromUri(stream.url))
                prepare()
                playWhenReady = true
            }
    }
    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlayerError(e: PlaybackException) {
                error = if (e.errorCode in NETWORK_ERRORS) t("No se pudo descargar del ordenador.") else t("Este archivo no se puede reproducir en el móvil.")
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }
    // Al salir de la app (o apagar la pantalla) se pausa; no vuelve a sonar solo.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, player) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) player.pause() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    val fullscreen by rememberUpdatedState(onFullscreen)
    Box(modifier.fillMaxSize().background(if (audio) Color.Transparent else Color.Black).testTag("viewer-player"), contentAlignment = Alignment.Center) {
        if (audio) Icon(Icons.Outlined.MusicNote, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(72.dp))
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                    this.player = player
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                    setBackgroundColor(android.graphics.Color.TRANSPARENT)
                    if (audio) {
                        // Sin imagen que tapar: los controles se quedan siempre a la vista.
                        controllerShowTimeoutMs = 0
                        controllerHideOnTouch = false
                        defaultArtwork = null
                    } else {
                        setFullscreenButtonClickListener { fullscreen(it) }
                    }
                }
            },
            update = { it.player = player },
            onRelease = { it.player = null },
            modifier = Modifier.fillMaxSize(),
        )
        error?.let { message ->
            Column(Modifier.fillMaxSize().background(Color(0xCC060B16)).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center) {
                Icon(Icons.Outlined.ErrorOutline, contentDescription = null, tint = Orbita.Danger, modifier = Modifier.size(36.dp))
                Spacer(Modifier.height(10.dp))
                Text(message, color = Orbita.Text, style = MaterialTheme.typography.bodyLarge)
                Spacer(Modifier.height(14.dp))
                OrbitaButton(t("Reintentar"), onClick = {
                    error = null
                    player.prepare()
                    player.play()
                }, haptic = Haptic.Tap)
            }
        }
    }
}

private val NETWORK_ERRORS = setOf(
    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
    PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
    PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
    PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND,
    PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
)

/**
 * Pantalla completa del vídeo: gira a horizontal y oculta las barras del sistema mientras [on]; «Atrás» sale de ella
 * (no cierra el visor). Al salir deja el giro y las barras como estaban.
 */
@Composable
fun FullscreenVideo(on: Boolean, onExit: () -> Unit) {
    val activity = LocalContext.current.findActivity() ?: return
    androidx.activity.compose.BackHandler(enabled = on, onBack = onExit)
    DisposableEffect(on) {
        if (!on) return@DisposableEffect onDispose {}
        val previous = activity.requestedOrientation
        activity.requestedOrientation = android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        val bars = androidx.core.view.WindowCompat.getInsetsController(activity.window, activity.window.decorView)
        bars.systemBarsBehavior = androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        bars.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars())
        onDispose {
            activity.requestedOrientation = previous
            bars.show(androidx.core.view.WindowInsetsCompat.Type.systemBars())
        }
    }
}

private tailrec fun android.content.Context.findActivity(): android.app.Activity? = when (this) {
    is android.app.Activity -> this
    is android.content.ContextWrapper -> baseContext.findActivity()
    else -> null
}
