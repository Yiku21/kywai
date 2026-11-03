package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aicowork.remote.ui.space.GlassRegion
import com.aicowork.remote.ui.space.GlassRegistry

/**
 * Dónde se registran los cristales y si el mundo los difumina ([blur]); sin difuminado (efectos Suaves, sin
 * OpenGL o en pruebas) el velo es más opaco para que se lea igual.
 */
class GlassContext(val registry: GlassRegistry?, val blur: Boolean)

val LocalGlass = staticCompositionLocalOf { GlassContext(null, blur = false) }

/**
 * Superficie de cristal esmerilado: velo translúcido y borde fino con luz arriba (sin sombra de elevación: a través
 * del cristal se vería). Registra su rectángulo para que el mundo dibuje difuminado lo que queda debajo. [alpha]
 * acompaña a las transiciones.
 */
@Composable
fun Modifier.glass(
    radius: Dp = 30.dp,
    alpha: Float = 1f,
    tint: Color? = null,
): Modifier {
    val glass = LocalGlass.current
    val density = LocalDensity.current
    val key = remember { Any() }
    val bounds = remember { FloatArray(4) { Float.NaN } }
    val registry = glass.registry
    val radiusPx = with(density) { radius.toPx() }
    fun publish() {
        if (registry == null) return
        if (!glass.blur || bounds[0].isNaN() || alpha <= 0.01f) registry.put(key, null)
        else registry.put(key, GlassRegion(bounds[0], bounds[1], bounds[2], bounds[3], radiusPx, alpha))
    }
    if (registry != null) {
        DisposableEffect(registry, key) { onDispose { registry.put(key, null) } }
        // La opacidad cambia sin mover el panel (transiciones): se vuelve a publicar en cada composición.
        SideEffect { publish() }
    }
    val shape = RoundedCornerShape(radius)
    val veil = tint ?: if (glass.blur) Orbita.Glass else Orbita.GlassSolid
    return this
        .then(
            if (registry == null) Modifier
            else Modifier.onGloballyPositioned { c ->
                val p = c.positionInRoot()
                bounds[0] = p.x; bounds[1] = p.y; bounds[2] = p.x + c.size.width; bounds[3] = p.y + c.size.height
                publish()
            },
        )
        .clip(shape)
        .background(veil)
        .border(1.dp, Brush.verticalGradient(listOf(Orbita.GlassEdgeTop, Orbita.GlassEdgeBottom)), shape)
}

/** Caja de cristal (atajo). */
@Composable
fun GlassBox(modifier: Modifier = Modifier, radius: Dp = 30.dp, alpha: Float = 1f, content: @Composable BoxScope.() -> Unit) {
    Box(modifier.glass(radius, alpha), content = content)
}

/** Tarjeta dentro de un panel: algo más clara, sin difuminado propio. */
fun Modifier.card(radius: Dp = 20.dp, selected: Boolean = false): Modifier {
    val shape = RoundedCornerShape(radius)
    return this
        .clip(shape)
        .background(if (selected) Orbita.CardPressed else Orbita.Card)
        .border(1.dp, if (selected) Orbita.AccentEdge else Orbita.CardEdge, shape)
}
