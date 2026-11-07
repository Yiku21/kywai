package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.aicowork.remote.R
import com.aicowork.remote.data.model.Agent

/** Encoge un poco el control mientras se pulsa: «he registrado tu toque». */
@Composable
fun Modifier.pressScale(interaction: MutableInteractionSource, pressed: Float = 0.95f): Modifier {
    val isPressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (isPressed) pressed else 1f, spring(dampingRatio = 0.55f, stiffness = 900f), label = "press")
    return graphicsLayer { scaleX = scale; scaleY = scale }
}

/** Zona pulsable con presión visible y, si se pide, vibración. */
@Composable
fun Modifier.tappable(
    enabled: Boolean = true,
    role: Role = Role.Button,
    haptic: Haptic = Haptic.Tap,
    onClick: () -> Unit,
): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val feedback = LocalFeedback.current
    return this
        .pressScale(interaction)
        .clickable(interaction, indication = androidx.compose.material3.ripple(color = Orbita.Accent), enabled = enabled, role = role) {
            when (haptic) {
                Haptic.Tap -> feedback.tap()
                Haptic.Select -> feedback.select()
                Haptic.Confirm -> feedback.confirm()
                Haptic.None -> Unit
            }
            onClick()
        }
}

enum class Haptic { None, Tap, Select, Confirm }

enum class ButtonStyle { Primary, Secondary, Ghost, Danger }

/**
 * Botón Órbita. [busy]: la acción está en marcha (se ve un indicador y no se puede repetir). Nunca muestra éxito:
 * eso lo hace quien recibe la confirmación real.
 */
@Composable
fun OrbitaButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    style: ButtonStyle = ButtonStyle.Primary,
    enabled: Boolean = true,
    busy: Boolean = false,
    haptic: Haptic = Haptic.Confirm,
    height: Dp = 52.dp,
) {
    val shape = RoundedCornerShape(height / 2)
    val (bg, fg, edge) = when (style) {
        ButtonStyle.Primary -> Triple(Brush.verticalGradient(listOf(Orbita.AccentButtonTop, Orbita.AccentButton)), Color.White, Orbita.AccentEdge)
        ButtonStyle.Secondary -> Triple(Brush.verticalGradient(listOf(Color(0x33223654), Color(0x33223654))), Orbita.Text, Color(0x33B4CCF5))
        ButtonStyle.Ghost -> Triple(Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent)), Orbita.TextSoft, Color(0x26B4CCF5))
        ButtonStyle.Danger -> Triple(Brush.verticalGradient(listOf(Color(0x40FF6D7C), Color(0x33FF6D7C))), Color(0xFFFFC9CF), Color(0x66FF6D7C))
    }
    val alpha = if (enabled) 1f else 0.45f
    Row(
        modifier
            .heightIn(min = height)
            .graphicsLayer { this.alpha = alpha }
            .clip(shape)
            .background(bg)
            .border(1.dp, edge, shape)
            .tappable(enabled = enabled && !busy, haptic = haptic, onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(18.dp), color = fg, strokeWidth = 2.dp)
            Spacer(Modifier.width(10.dp))
        } else if (icon != null) {
            Icon(icon, contentDescription = null, tint = fg, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
        }
        Text(text, color = fg, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** Botón redondo de icono (cerrar, ampliar, más opciones). */
@Composable
fun IconAction(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = Orbita.TextSoft,
    size: Dp = 44.dp,
    enabled: Boolean = true,
) {
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .tappable(enabled = enabled, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = if (enabled) tint else tint.copy(alpha = 0.4f), modifier = Modifier.size(22.dp))
    }
}

/** Control segmentado («En curso · Por revisar · Hechas»). */
@Composable
fun <T> Segmented(
    options: List<Pair<T, String>>,
    selected: T,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
    counts: Map<T, Int> = emptyMap(),
) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        options.forEach { (value, label) ->
            val on = value == selected
            val bg by animateColorAsState(if (on) Orbita.AccentSoft else Color(0x1A223654), tween(180), label = "seg")
            val edge by animateColorAsState(if (on) Orbita.AccentEdge else Color(0x26B4CCF5), tween(180), label = "segEdge")
            Row(
                Modifier
                    .weight(1f)
                    .heightIn(min = 42.dp)
                    .clip(Orbita.PillShape)
                    .background(bg)
                    .border(1.dp, edge, Orbita.PillShape)
                    .tappable(role = Role.Tab, haptic = Haptic.Select) { onSelect(value) }
                    .semantics { this.selected = on }
                    .padding(horizontal = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                Text(label, color = if (on) Color.White else Orbita.TextSoft, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                counts[value]?.takeIf { it > 0 }?.let {
                    Spacer(Modifier.width(6.dp))
                    CountBadge(it, accent = on)
                }
            }
        }
    }
}

@Composable
fun CountBadge(count: Int, accent: Boolean = true) {
    Box(
        Modifier
            .heightIn(min = 20.dp)
            .clip(Orbita.PillShape)
            .background(if (accent) Orbita.Accent.copy(alpha = 0.85f) else Color(0x40B4CCF5))
            .padding(horizontal = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 99) "99+" else count.toString(), color = if (accent) Color(0xFF04141A) else Orbita.Text, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

/** Avatar 2D del robot (las mismas ilustraciones que el escritorio). */
@Composable
fun RobotFace(agent: Agent?, size: Dp, modifier: Modifier = Modifier, ring: Color? = null) {
    val res = robotDrawable(agent)
    val ringMod = if (ring != null) Modifier.border(2.dp, ring, CircleShape).padding(3.dp) else Modifier
    Box(modifier.size(size).then(ringMod), contentAlignment = Alignment.Center) {
        Image(painterResource(res), contentDescription = agent?.name, contentScale = ContentScale.Crop, modifier = Modifier.size(size - if (ring != null) 6.dp else 0.dp).clip(CircleShape))
    }
}

fun robotDrawable(agent: Agent?): Int = when {
    agent == null -> R.drawable.robot_hermes
    agent.isSubagent -> R.drawable.robot_becario
    else -> when (agent.provider) {
        "hermes" -> R.drawable.robot_hermes
        "claude" -> R.drawable.robot_claude
        "codex" -> R.drawable.robot_codex
        "gemini" -> R.drawable.robot_gemini
        "muse" -> R.drawable.robot_muse
        "qwen", "ollama", "lmstudio" -> R.drawable.robot_qwen
        else -> R.drawable.robot_becario
    }
}

/** Barra de progreso fina. Sin medida real ([progress] null) se ve una actividad suave, nunca un % inventado. */
@Composable
fun ProgressLine(progress: Float?, color: Color, modifier: Modifier = Modifier, animate: Boolean = true) {
    val sweep = if (progress == null && animate) {
        val t = rememberInfiniteTransition(label = "sweep")
        t.animateFloat(0f, 1f, infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart), label = "x").value
    } else 0.35f
    val shown by animateFloatAsState(progress ?: 0f, tween(400), label = "progress")
    Canvas(modifier.fillMaxWidth().height(4.dp)) {
        val r = CornerRadius(size.height / 2)
        drawRoundRect(Color(0x26B4CCF5), cornerRadius = r)
        if (progress != null) {
            drawRoundRect(color, size = Size(size.width * shown.coerceIn(0f, 1f), size.height), cornerRadius = r)
        } else {
            val w = size.width * 0.3f
            val x = (size.width + w) * sweep - w
            drawRoundRect(color.copy(alpha = 0.8f), topLeft = Offset(x.coerceAtLeast(0f), 0f), size = Size((w + x.coerceAtMost(0f)).coerceAtMost(size.width - x.coerceAtLeast(0f)).coerceAtLeast(0f), size.height), cornerRadius = r)
        }
    }
}

@Composable
fun Dot(color: Color, size: Dp = 9.dp, pulse: Boolean = false) {
    val a = if (pulse) {
        val t = rememberInfiniteTransition(label = "dot")
        t.animateFloat(0.45f, 1f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "a").value
    } else 1f
    Box(Modifier.size(size).graphicsLayer { alpha = a }.clip(CircleShape).background(color))
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(top = 6.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, color = Orbita.TextSoft, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** Mensaje vacío o «no disponible» con el motivo. */
@Composable
fun Note(icon: ImageVector, title: String, text: String?, modifier: Modifier = Modifier, tint: Color = Orbita.Accent) {
    Column(modifier.fillMaxWidth().card().padding(18.dp), horizontalAlignment = Alignment.Start) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(10.dp))
            Text(title, color = Orbita.Text, style = MaterialTheme.typography.titleSmall)
        }
        if (!text.isNullOrBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(text, color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/** Marca de kywai: las tres gotas del logo (res/drawable/logo_kywai.xml). */
@Composable
fun LogoMark(size: Dp = 30.dp) {
    Image(painterResource(R.drawable.logo_kywai), contentDescription = "kywai", modifier = Modifier.size(size))
}

/** Fondo sutil para una fila seleccionable dentro de un panel. */
fun Modifier.rowHighlight(on: Boolean): Modifier = if (!on) this else drawBehind {
    drawRoundRect(Orbita.AccentSoft, cornerRadius = CornerRadius(20.dp.toPx()))
}

/**
 * Campo de texto Órbita (cristal claro, borde que se enciende al escribir). [onIme] se llama con la acción del
 * teclado; [autoFocus] lo enfoca al aparecer.
 */
@Composable
fun OrbitaField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else 6,
    imeAction: androidx.compose.ui.text.input.ImeAction = androidx.compose.ui.text.input.ImeAction.Done,
    onIme: () -> Unit = {},
    autoFocus: Boolean = false,
    leading: ImageVector? = null,
    enabled: Boolean = true,
) {
    val focus = remember { androidx.compose.ui.focus.FocusRequester() }
    var focused by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    if (autoFocus) androidx.compose.runtime.LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val edge by animateColorAsState(if (focused) Orbita.AccentEdge else Color(0x2EB4CCF5), tween(160), label = "field")
    val shape = RoundedCornerShape(if (singleLine) 26.dp else 22.dp)
    androidx.compose.foundation.text.BasicTextField(
        value = value,
        onValueChange = onValueChange,
        enabled = enabled,
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = Orbita.Text),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(Orbita.Accent),
        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
            imeAction = imeAction,
            capitalization = androidx.compose.ui.text.input.KeyboardCapitalization.Sentences,
        ),
        keyboardActions = androidx.compose.foundation.text.KeyboardActions(onAny = { onIme() }),
        modifier = modifier
            .fillMaxWidth()
            .focusRequester(focus)
            .onFocusChanged { focused = it.isFocused },
        decorationBox = { inner ->
            Row(
                Modifier
                    .clip(shape)
                    .background(Color(0x40101A30))
                    .border(1.dp, edge, shape)
                    .heightIn(min = 52.dp)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalAlignment = if (singleLine) Alignment.CenterVertically else Alignment.Top,
            ) {
                if (leading != null) {
                    Icon(leading, contentDescription = null, tint = Orbita.TextSoft, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(10.dp))
                }
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Text(placeholder, color = Orbita.TextFaint, style = MaterialTheme.typography.bodyLarge, maxLines = 1)
                    inner()
                }
            }
        },
    )
}
