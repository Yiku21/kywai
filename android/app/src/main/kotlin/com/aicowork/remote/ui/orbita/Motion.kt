package com.aicowork.remote.ui.orbita

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically

/**
 * Movimiento común de Órbita (habilidad «principios-ux-animacion», como en el escritorio): lo que entra llega rápido y
 * frena al final; lo que sale acelera y tarda menos (70–80 %). Las duraciones siguen la escala de animaciones del
 * sistema (con «Quitar animaciones» de Android no se mueve nada).
 */
object OrbitaMotion {
    /** Entrar: rápido y frena al llegar. */
    val EnterEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)

    /** Salir: arranca suave y se va deprisa. */
    val ExitEasing = CubicBezierEasing(0.4f, 0f, 1f, 1f)

    const val SHEET_IN_MS = 280
    const val SHEET_OUT_MS = 200
    const val FADE_IN_MS = 180
    const val FADE_OUT_MS = 140

    /** Hojas que suben desde abajo (tarea, bandeja, búsqueda…). [fraction]: cuánto de su alto recorren. */
    fun sheetEnter(fraction: Int = 4): EnterTransition =
        fadeIn(tween(FADE_IN_MS, easing = EnterEasing)) + slideInVertically(tween(SHEET_IN_MS, easing = EnterEasing)) { it / fraction }

    fun sheetExit(fraction: Int = 4): ExitTransition =
        fadeOut(tween(FADE_OUT_MS, easing = ExitEasing)) + slideOutVertically(tween(SHEET_OUT_MS, easing = ExitEasing)) { it / fraction }

    /** El velo oscuro de detrás. */
    val scrimEnter: EnterTransition = fadeIn(tween(FADE_IN_MS, easing = EnterEasing))
    val scrimExit: ExitTransition = fadeOut(tween(FADE_OUT_MS, easing = ExitEasing))

    /** El lector de archivos: se asienta desde un 97 %. */
    val viewerEnter: EnterTransition = fadeIn(tween(FADE_IN_MS, easing = EnterEasing)) + scaleIn(tween(240, easing = EnterEasing), initialScale = 0.97f)
    val viewerExit: ExitTransition = fadeOut(tween(FADE_OUT_MS, easing = ExitEasing)) + scaleOut(tween(FADE_OUT_MS, easing = ExitEasing), targetScale = 0.97f)

    /** Un error que se nota: 3 sacudidas de ±6 dp en 300 ms (ver [shake]). */
    val SHAKE_OFFSETS = floatArrayOf(-6f, 6f, -5f, 5f, -3f, 0f)

    /** Hace temblar un desplazamiento horizontal (en dp) como en el escritorio. */
    suspend fun shake(offset: Animatable<Float, *>) {
        val step = 300 / SHAKE_OFFSETS.size
        for (x in SHAKE_OFFSETS) offset.animateTo(x, tween(step))
    }
}
