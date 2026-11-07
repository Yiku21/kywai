package com.aicowork.remote.ui.orbita

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.lerp
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Colores base de un tema: los mismos tokens que el escritorio (styles/tokens.css y themes.css). De ellos salen el
 * cristal, las tarjetas y el acento de Órbita, para que el móvil se vea con el tema elegido en el ordenador.
 */
data class ThemeTokens(
    val bg: Long,
    val panel: Long,
    val surface: Long,
    val text: Long,
    val textSoft: Long,
    val textFaint: Long,
    val accent: Long,
    /** Color de las líneas y bordes (--line-rgb). */
    val line: Long,
    val light: Boolean = false,
    val live: Long = 0xFF4CD083,
    val warn: Long = 0xFFF0B54E,
    val danger: Long = 0xFFFF6D7C,
)

/** Los colores de la interfaz con un tema. */
class OrbitaPalette(val tokens: ThemeTokens) {
    private fun c(v: Long) = Color(v)
    private fun Color.a(alpha: Int) = copy(alpha = alpha / 255f)

    val light = tokens.light
    val Night = c(tokens.bg)
    val Text = c(tokens.text)
    val TextSoft = c(tokens.textSoft)
    val TextFaint = c(tokens.textFaint)
    val Glass = c(tokens.panel).a(if (light) 0xC8 else 0x9C)
    val GlassSolid = c(tokens.panel).a(if (light) 0xF2 else 0xEB)
    val GlassPopover = lerp(c(tokens.panel), c(tokens.surface), 0.4f).a(if (light) 0xF5 else 0xE6)
    val GlassEdgeTop = c(tokens.line).a(if (light) 0x40 else 0x3D)
    val GlassEdgeBottom = (if (light) Color.Black else Color.White).a(0x0F)
    val Card = c(tokens.surface).a(if (light) 0xB3 else 0x4D)
    val CardPressed = lerp(c(tokens.surface), c(tokens.accent), 0.12f).a(if (light) 0xE6 else 0x80)
    val CardEdge = c(tokens.line).a(if (light) 0x26 else 0x1C)
    val Accent = c(tokens.accent)
    val AccentSoft = lerp(c(tokens.accent), c(tokens.bg), 0.25f).a(if (light) 0x2E else 0x33)
    val AccentEdge = c(tokens.accent).a(0x8A)
    /** Botón principal: el acento apagado hacia el fondo (en los temas claros, el acento tal cual). */
    val AccentButton = if (light) lerp(c(tokens.accent), Color.Black, 0.12f) else lerp(c(tokens.accent), c(tokens.bg), 0.58f)
    val AccentButtonTop = if (light) c(tokens.accent) else lerp(c(tokens.accent), c(tokens.bg), 0.42f)
    val Live = c(tokens.live)
    val Warn = c(tokens.warn)
    val Danger = c(tokens.danger)
    val Divider = c(tokens.line).a(0x26)
    /** Burbuja de tus mensajes: el acento hacia el fondo. */
    val UserBubble = lerp(c(tokens.accent), c(tokens.bg), if (light) 0.72f else 0.62f).a(if (light) 0xCC else 0xA6)
}

/** Los temas del escritorio (lib/theme.ts): los colores de la interfaz, por su id. */
object OrbitaThemes {
    /** El aspecto de siempre de Órbita: con ordenadores que aún no mandan su tema. */
    val Default = ThemeTokens(0xFF050A18, 0xFF0B1324, 0xFF1A2740, 0xFFEAF0FA, 0xFFAAB6CB, 0xFF6E7B92, 0xFF4FC3D6, 0xFFB4CCF5)

    private val ui: Map<String, ThemeTokens> = mapOf(
        "clasico" to ThemeTokens(0xFF060A12, 0xFF0B111C, 0xFF101828, 0xFFE9EEF8, 0xFFA3B0C6, 0xFF6B7890, 0xFF38D6FF, 0xFF96B4E6),
        "orbita" to ThemeTokens(0xFF050A17, 0xFF0E1830, 0xFF1C2C4E, 0xFFEEF4FF, 0xFFB0C0DC, 0xFF7488AA, 0xFF5CC8FF, 0xFFB4CCF5),
        "marfil" to ThemeTokens(0xFFE9E3D6, 0xFFF6F2EA, 0xFFFBF8F2, 0xFF26231D, 0xFF5A5446, 0xFF8A8270, 0xFF2F8F68, 0xFF5A4E36, light = true, live = 0xFF1F9D5A, warn = 0xFFB4761A, danger = 0xFFCF3448),
        "grafito" to ThemeTokens(0xFF0A0A0C, 0xFF121315, 0xFF18191C, 0xFFEDEBE7, 0xFFABA79F, 0xFF76736C, 0xFFE0A34A, 0xFFCDC8BE),
        "bosque" to ThemeTokens(0xFF06100B, 0xFF0B1812, 0xFF102219, 0xFFE8F3EC, 0xFFA6C3B1, 0xFF6B8A77, 0xFFD4AF5A, 0xFFA0D7B4),
        "matrix" to ThemeTokens(0xFF000000, 0xFF030A05, 0xFF061108, 0xFFC9FFD8, 0xFF70D991, 0xFF3D8B56, 0xFF2BFF6A, 0xFF2BFF6A, live = 0xFF2BFF6A),
        "eva" to ThemeTokens(0xFF110620, 0xFF190B2D, 0xFF21113A, 0xFFF2EBFF, 0xFFC0B0E0, 0xFF8A78AD, 0xFFA6FF3A, 0xFFBEA0FF, warn = 0xFFFF8A1F),
        "relicario" to ThemeTokens(0xFF07080A, 0xFF101216, 0xFF16191E, 0xFFEEF0F4, 0xFFADB2BE, 0xFF767C88, 0xFFE8C27A, 0xFFD2D7E4),
        "telar" to ThemeTokens(0xFF0A0B0F, 0xFF111319, 0xFF171A21, 0xFFEEF0F6, 0xFFACB2C2, 0xFF737A8C, 0xFFB8C4E0, 0xFFC8D0E4),
        "halloween" to ThemeTokens(0xFF0B0610, 0xFF130C19, 0xFF1A1122, 0xFFF6EEF4, 0xFFC2B0BF, 0xFF87768A, 0xFFFF8A1F, 0xFFDCBEE6, warn = 0xFFFFC15A),
        "navidad" to ThemeTokens(0xFF07110F, 0xFF0D1A18, 0xFF12231F, 0xFFEEF6F2, 0xFFAAC2B8, 0xFF6F8A80, 0xFFF0C050, 0xFFBEE1D2, danger = 0xFFFF5A5A),
    )

    /** Los colores de la interfaz de un tema: un mapa («mundo-bosque») usa los del color con su nombre, como el escritorio. */
    fun uiOf(id: String?): String? = id?.removePrefix("mundo-")?.takeIf { it in ui }

    fun tokens(id: String?): ThemeTokens = uiOf(id)?.let { ui[it] } ?: Default
}

/**
 * Órbita: colores algo desaturados, luz suave y pequeños acentos. Los paneles son cristal esmerilado (el mundo los
 * difumina por detrás) y el texto siempre nítido. Los colores siguen el tema elegido en el ordenador ([palette]).
 */
object Orbita {
    /** El tema en uso (lo pone OrbitaApp con el que manda el ordenador); cambiarlo repinta toda la interfaz. */
    var palette by mutableStateOf(OrbitaPalette(OrbitaThemes.Default))

    val Night get() = palette.Night
    val Text get() = palette.Text
    val TextSoft get() = palette.TextSoft
    val TextFaint get() = palette.TextFaint

    /** Velo del cristal cuando el mundo difumina lo de detrás (Normal/Completa). */
    val Glass get() = palette.Glass
    /** Sin difuminado (Suave o sin OpenGL): más opaco para que el texto se lea igual de bien. */
    val GlassSolid get() = palette.GlassSolid
    /** Menús y avisos que flotan encima de otros paneles (el mundo solo difumina lo que tiene justo detrás). */
    val GlassPopover get() = palette.GlassPopover
    val GlassEdgeTop get() = palette.GlassEdgeTop
    val GlassEdgeBottom get() = palette.GlassEdgeBottom
    /** Tarjetas dentro de un panel. */
    val Card get() = palette.Card
    val CardPressed get() = palette.CardPressed
    val CardEdge get() = palette.CardEdge

    /** Acento principal (el --cyan del tema). */
    val Accent get() = palette.Accent
    val AccentSoft get() = palette.AccentSoft
    val AccentEdge get() = palette.AccentEdge
    val AccentButton get() = palette.AccentButton
    val AccentButtonTop get() = palette.AccentButtonTop
    /** Separadores finos. */
    val Divider get() = palette.Divider
    val UserBubble get() = palette.UserBubble

    val Live get() = palette.Live
    val Warn get() = palette.Warn
    val Danger get() = palette.Danger
    val Success = Color(0xFF63DCA4)
    val Gold = Color(0xFFD6A743)

    val PanelShape = RoundedCornerShape(30.dp)
    val CardShape = RoundedCornerShape(20.dp)
    val PillShape = RoundedCornerShape(50)
}

private fun orbitaColors(p: OrbitaPalette) = (if (p.light) lightColorScheme() else darkColorScheme()).copy(
    primary = p.Accent,
    onPrimary = if (p.light) Color.White else Color(0xFF04141A),
    primaryContainer = p.AccentButton,
    onPrimaryContainer = Color.White,
    secondary = p.TextSoft,
    background = p.Night,
    onBackground = p.Text,
    surface = lerp(p.Night, Color(p.tokens.surface), 0.5f),
    onSurface = p.Text,
    surfaceVariant = Color(p.tokens.surface),
    onSurfaceVariant = p.TextSoft,
    surfaceContainerHighest = lerp(Color(p.tokens.surface), p.Text, 0.06f),
    surfaceContainerHigh = lerp(Color(p.tokens.surface), p.Text, 0.03f),
    surfaceContainer = Color(p.tokens.surface),
    outline = p.GlassEdgeTop,
    outlineVariant = p.Divider,
    error = p.Danger,
    onError = if (p.light) Color.White else Color(0xFF2A0207),
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
    val palette = Orbita.palette
    val colors = remember(palette) { orbitaColors(palette) }
    MaterialTheme(colorScheme = colors, typography = OrbitaType, content = content)
}
