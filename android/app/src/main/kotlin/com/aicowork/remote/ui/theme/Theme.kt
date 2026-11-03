package com.aicowork.remote.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.aicowork.remote.data.store.ThemeMode

private val Violet = Color(0xFF6C4DF5)
private val VioletLight = Color(0xFFB9A8FF)

private val LightColors = lightColorScheme(
    primary = Violet,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE7E0FF),
    onPrimaryContainer = Color(0xFF22005E),
    secondary = Color(0xFF0E8C86),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFC9F2EE),
    onSecondaryContainer = Color(0xFF00201E),
    tertiary = Color(0xFFB4570F),
    tertiaryContainer = Color(0xFFFFDCC5),
    onTertiaryContainer = Color(0xFF331200),
    background = Color(0xFFFCFAFF),
    surface = Color(0xFFFCFAFF),
    surfaceVariant = Color(0xFFE6E0F0),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF6F2FC),
    surfaceContainer = Color(0xFFF0ECF7),
    surfaceContainerHigh = Color(0xFFEAE6F1),
    surfaceContainerHighest = Color(0xFFE4E0EC),
    error = Color(0xFFBA1A1A),
    errorContainer = Color(0xFFFFDAD6),
)

private val DarkColors = darkColorScheme(
    primary = VioletLight,
    onPrimary = Color(0xFF35118F),
    primaryContainer = Color(0xFF4C2FC7),
    onPrimaryContainer = Color(0xFFE7E0FF),
    secondary = Color(0xFF6ED8CF),
    onSecondary = Color(0xFF003734),
    secondaryContainer = Color(0xFF00504C),
    onSecondaryContainer = Color(0xFFC9F2EE),
    tertiary = Color(0xFFFFB783),
    tertiaryContainer = Color(0xFF713600),
    onTertiaryContainer = Color(0xFFFFDCC5),
    background = Color(0xFF131218),
    surface = Color(0xFF131218),
    surfaceVariant = Color(0xFF48454F),
    surfaceContainerLowest = Color(0xFF0E0D13),
    surfaceContainerLow = Color(0xFF1B1A21),
    surfaceContainer = Color(0xFF201E26),
    surfaceContainerHigh = Color(0xFF2A2830),
    surfaceContainerHighest = Color(0xFF35333B),
    error = Color(0xFFFFB4AB),
    errorContainer = Color(0xFF93000A),
)

/** Colores de estado que no dependen del color dinámico (para que «hecho» siempre se lea como hecho). */
@Immutable
data class StatusColors(
    val success: Color,
    val warning: Color,
    val danger: Color,
    val neutral: Color,
    val info: Color,
)

private val LightStatus = StatusColors(Color(0xFF1B7F3B), Color(0xFF9A6400), Color(0xFFBA1A1A), Color(0xFF6B6779), Color(0xFF3557C9))
private val DarkStatus = StatusColors(Color(0xFF7FDB98), Color(0xFFFFC56B), Color(0xFFFFB4AB), Color(0xFFB2AEC0), Color(0xFFAFC2FF))

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

private val AppTypography = Typography().let { base ->
    base.copy(
        headlineSmall = base.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
        titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    )
}

val MonoStyle = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 15.sp, letterSpacing = 0.5.sp)

@Composable
fun CoworkTheme(
    themeMode: ThemeMode = ThemeMode.System,
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val dark = when (themeMode) {
        ThemeMode.System -> isSystemInDarkTheme()
        ThemeMode.Light -> false
        ThemeMode.Dark -> true
    }
    val scheme: ColorScheme = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        dark -> DarkColors
        else -> LightColors
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalStatusColors provides if (dark) DarkStatus else LightStatus) {
        MaterialTheme(colorScheme = scheme, typography = AppTypography, content = content)
    }
}
