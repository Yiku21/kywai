package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Órbita: oscuro, colores algo desaturados, luz suave y pequeños acentos. Los paneles son cristal esmerilado
 * (el mundo los difumina por detrás) y el texto siempre nítido.
 */
object Orbita {
    val Night = Color(0xFF050A18)
    val Text = Color(0xFFEAF0FA)
    val TextSoft = Color(0xFFAAB6CB)
    val TextFaint = Color(0xFF6E7B92)

    /** Velo del cristal cuando el mundo difumina lo de detrás (Normal/Completa). */
    val Glass = Color(0x9C0B1324)
    /** Sin difuminado (Suave o sin OpenGL): más opaco para que el texto se lea igual de bien. */
    val GlassSolid = Color(0xEB0B1324)
    /** Menús y avisos que flotan encima de otros paneles (el mundo solo difumina lo que tiene justo detrás). */
    val GlassPopover = Color(0xE60D1629)
    val GlassEdgeTop = Color(0x3DB4CCF5)
    val GlassEdgeBottom = Color(0x0FFFFFFF)
    /** Tarjetas dentro de un panel. */
    val Card = Color(0x4D1A2740)
    val CardPressed = Color(0x80223352)
    val CardEdge = Color(0x1CFFFFFF)

    /** Acento principal: cian verdoso apagado. */
    val Accent = Color(0xFF4FC3D6)
    val AccentSoft = Color(0x332E8FA3)
    val AccentEdge = Color(0x8A4FC3D6)
    val AccentButton = Color(0xFF1F6B80)
    val AccentButtonTop = Color(0xFF2A88A0)

    val Live = Color(0xFF4CD083)
    val Warn = Color(0xFFF0B54E)
    val Danger = Color(0xFFFF6D7C)
    val Success = Color(0xFF63DCA4)
    val Gold = Color(0xFFD6A743)

    val PanelShape = RoundedCornerShape(30.dp)
    val CardShape = RoundedCornerShape(20.dp)
    val PillShape = RoundedCornerShape(50)
}

private val OrbitaColors = darkColorScheme(
    primary = Orbita.Accent,
    onPrimary = Color(0xFF04141A),
    primaryContainer = Orbita.AccentButton,
    onPrimaryContainer = Color.White,
    secondary = Color(0xFF9DB4D6),
    background = Orbita.Night,
    onBackground = Orbita.Text,
    surface = Color(0xFF0C1426),
    onSurface = Orbita.Text,
    surfaceVariant = Color(0xFF16213A),
    onSurfaceVariant = Orbita.TextSoft,
    surfaceContainerHighest = Color(0xFF1A2742),
    surfaceContainerHigh = Color(0xFF152038),
    surfaceContainer = Color(0xFF111B30),
    outline = Color(0x40B4CCF5),
    outlineVariant = Color(0x22B4CCF5),
    error = Orbita.Danger,
    onError = Color(0xFF2A0207),
)

private val base = Typography()
private val OrbitaType = Typography(
    headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.sp),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold, fontSize = 17.sp),
    titleSmall = base.titleSmall.copy(fontWeight = FontWeight.Medium, fontSize = 15.sp),
    bodyLarge = base.bodyLarge.copy(fontSize = 16.sp, lineHeight = 23.sp),
    bodyMedium = base.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = base.bodySmall.copy(fontSize = 12.5.sp, lineHeight = 17.sp),
    labelLarge = base.labelLarge.copy(fontWeight = FontWeight.Medium, fontSize = 14.sp),
    labelMedium = base.labelMedium.copy(fontSize = 12.5.sp),
)

val Mono = TextStyle(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace, fontSize = 12.5.sp, lineHeight = 18.sp)

@Composable
fun OrbitaTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = OrbitaColors, typography = OrbitaType, content = content)
}
