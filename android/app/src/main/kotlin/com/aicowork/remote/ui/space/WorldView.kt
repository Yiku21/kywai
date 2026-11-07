package com.aicowork.remote.ui.space

import com.aicowork.remote.i18n.t

import android.app.ActivityManager
import android.content.Context
import android.opengl.GLSurfaceView
import android.os.Build
import android.view.Choreographer
import android.view.Surface
import android.view.SurfaceHolder
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.aicowork.remote.ui.space.gl.FramePacer
import com.aicowork.remote.ui.space.gl.RenderPlan
import com.aicowork.remote.ui.space.gl.SpaceConfigChooser
import com.aicowork.remote.ui.space.gl.SpaceContextFactory

/**
 * Vista OpenGL del mundo. El renderizador (y con él todo el estado vivo) es el de [controller]: si esta vista se
 * recrea, el nuevo contexto solo reconstruye mallas, texturas y búferes. El ritmo lo marca el Choreographer según los
 * ajustes (30, 60 o la frecuencia de la pantalla; ~5 fps si el mundo está tapado) y se detiene en pausa.
 */
@Composable
internal fun WorldGlView(
    scene: SpaceScene,
    selectedId: String?,
    controller: WorldController,
    onFailure: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val density = LocalDensity.current.density
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val failure by rememberUpdatedState(onFailure)
    val lowEnd = remember { (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).isLowRamDevice }
    val es3 = remember { glEsVersion(context) >= 0x30000 }
    val renderer = controller.renderer(density, lowEnd)
    val view = remember(controller) {
        GLSurfaceView(context).apply {
            setEGLContextFactory(SpaceContextFactory(es3))
            setEGLConfigChooser(SpaceConfigChooser(es3))
            preserveEGLContextOnPause = true
            setRenderer(renderer)
            renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
        }
    }
    SideEffect {
        renderer.scene = scene
        renderer.selectedId = selectedId
        renderer.onError = { view.post { failure() } }
    }
    // Solo se dibuja con la pantalla a la vista: en pausa se detienen el ritmo y el hilo de OpenGL.
    DisposableEffect(lifecycle, view) {
        val pacer = FramePacer()
        var running = false
        var votedFps = -1
        val choreographer = Choreographer.getInstance()
        val tick = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
                if (!running) return
                val plan = RenderPlan.of(controller.settings, controller.covered, lowEnd)
                if (plan.maxFps != votedFps) {
                    votedFps = plan.maxFps
                    view.voteFrameRate(plan.maxFps)
                }
                if (pacer.shouldRender(frameTimeNanos, plan.maxFps)) view.requestRender()
                choreographer.postFrameCallback(this)
            }
        }
        val holderCallback = object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                // Superficie nueva (p. ej. al pasar de la pantalla exterior a la interior): se repite el voto de ritmo.
                votedFps = -1
            }
            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = Unit
            override fun surfaceDestroyed(holder: SurfaceHolder) = Unit
        }
        view.holder.addCallback(holderCallback)
        fun start() {
            if (running) return
            running = true
            choreographer.postFrameCallback(tick)
        }
        fun stop() {
            running = false
            choreographer.removeFrameCallback(tick)
        }
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> {
                    view.onResume()
                    start()
                }
                Lifecycle.Event.ON_PAUSE -> {
                    stop()
                    view.onPause()
                }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
            view.holder.removeCallback(holderCallback)
            stop()
            view.onPause()
        }
    }
    AndroidView(factory = { view }, modifier = modifier)
}

/**
 * Pide a la pantalla el ritmo del mundo (Android 11+): con 60 fps en una pantalla de 120 Hz, el panel puede bajar a
 * 60 Hz cuando nada más se mueve. 0 = sin preferencia.
 */
private fun GLSurfaceView.voteFrameRate(maxFps: Int) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
    val surface = holder.surface ?: return
    if (!surface.isValid) return
    try {
        val fps = if (maxFps in 1..60 && maxFps >= 30) maxFps.toFloat() else 0f
        surface.setFrameRate(fps, Surface.FRAME_RATE_COMPATIBILITY_DEFAULT)
    } catch (_: RuntimeException) {
        // Superficie a punto de destruirse: el siguiente fotograma lo vuelve a intentar.
    }
}

internal fun glEsVersion(context: Context): Int =
    (context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager)?.deviceConfigurationInfo?.reqGlEsVersion ?: 0

/**
 * Gestos sobre el mundo: un dedo gira, dos dedos desplazan y pellizcan, tocar elige (robot, estación, zona o núcleo)
 * con la misma proyección que se dibuja (encuadre en el hueco libre incluido) y un doble toque vuelve a la vista
 * general.
 */
@Composable
internal fun WorldTouchLayer(scene: SpaceScene, controller: WorldController, onPick: (ScenePick?) -> Unit, onTouched: () -> Unit = {}) {
    val currentScene by rememberUpdatedState(scene)
    val pick by rememberUpdatedState(onPick)
    val touched by rememberUpdatedState(onTouched)
    val minRadius = with(LocalDensity.current) { 24.dp.toPx() }
    val camera = controller.camera
    Box(
        Modifier
            .fillMaxSize()
            .testTag("space-canvas")
            .semantics { contentDescription = t("Vista 3D del equipo. {summary}", "summary" to scene.summary) }
            .pointerInput(controller) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false)
                    var dragging = false
                    do {
                        val event = awaitPointerEvent()
                        val pressed = event.changes.count { it.pressed }
                        val pan = event.calculatePan()
                        val zoom = event.calculateZoom()
                        if (!dragging && (pan.getDistance() > viewConfiguration.touchSlop || zoom != 1f)) {
                            dragging = true
                            touched()
                            camera.setDragging(true)
                        }
                        if (dragging) {
                            // La sensibilidad sigue al hueco libre: una altura del hueco = una vuelta.
                            val h = controller.framingFor(size.width.toFloat(), size.height.toFloat()).height
                            if (pressed >= 2) {
                                camera.pan(pan.x, pan.y, h)
                                if (zoom != 1f) camera.zoom(zoom)
                            } else if (pressed == 1) {
                                camera.orbit(pan.x, pan.y, h)
                            }
                            event.changes.forEach { if (it.positionChanged()) it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                    camera.setDragging(false)
                }
            }
            .pointerInput(controller) {
                detectTapGestures(
                    onTap = { offset ->
                        touched()
                        val w = size.width.toFloat()
                        val h = size.height.toFloat()
                        val vp = FloatArray(16)
                        val framing = controller.viewProjection(vp, w, h)
                        pick(ScenePicker.pick(vp, w, h, offset.x, offset.y, ScenePicker.targets(currentScene), minRadius, framing.height))
                    },
                    onDoubleTap = {
                        touched()
                        pick(null)
                        controller.overview()
                    },
                )
            },
    )
}
