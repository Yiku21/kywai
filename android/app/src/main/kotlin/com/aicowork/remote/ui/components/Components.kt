package com.aicowork.remote.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Block
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PauseCircle
import androidx.compose.material.icons.outlined.PlayCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.aicowork.remote.data.Connection
import com.aicowork.remote.data.model.Agent
import com.aicowork.remote.ui.theme.LocalStatusColors
import kotlinx.coroutines.delay

fun parseColor(hex: String, fallback: Color = Color(0xFF7C5CFF)): Color = runCatching {
    val clean = hex.removePrefix("#")
    when (clean.length) {
        6 -> Color(("FF$clean").toLong(16))
        8 -> Color(clean.toLong(16))
        else -> fallback
    }
}.getOrDefault(fallback)

@Composable
fun activityColor(activity: String): Color {
    val status = LocalStatusColors.current
    return when (activity) {
        "working" -> status.success
        "thinking" -> status.info
        "waiting" -> status.warning
        "error" -> status.danger
        "offline" -> status.neutral
        else -> status.neutral.copy(alpha = 0.7f)
    }
}

/** Avatar del agente: su color, sus iniciales y un punto con lo que está haciendo. */
@Composable
fun AgentAvatar(agent: Agent, size: Dp = 44.dp, showStatus: Boolean = true, modifier: Modifier = Modifier) {
    val color = parseColor(agent.color)
    Box(modifier.size(size).clearAndSetSemantics { }) {
        Box(
            Modifier
                .size(size)
                .clip(CircleShape)
                .background(color.copy(alpha = if (agent.activity == "offline") 0.45f else 1f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                Format.initials(agent.name),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = (size.value * 0.36f).sp,
            )
        }
        if (showStatus) {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .size(size * 0.3f)
                    .clip(CircleShape)
                    .background(activityColor(agent.activity))
                    .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)
            )
        }
    }
}

/** Etiqueta con icono de un estado. Nunca depende solo del color (accesibilidad). */
@Composable
fun StatusPill(text: String, color: Color, icon: ImageVector? = null, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = color.copy(alpha = 0.14f),
        contentColor = color,
    ) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
            }
            Text(text, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}

@Composable
fun TaskStatusPill(status: String, modifier: Modifier = Modifier) {
    val c = LocalStatusColors.current
    val (color, icon) = when (status) {
        "running" -> c.info to Icons.Outlined.PlayCircle
        "done" -> c.success to Icons.Outlined.CheckCircle
        "failed" -> c.danger to Icons.Outlined.ErrorOutline
        "cancelled" -> c.neutral to Icons.Outlined.PauseCircle
        "blocked" -> c.warning to Icons.Outlined.Block
        else -> c.neutral to Icons.Outlined.HourglassEmpty
    }
    StatusPill(Labels.taskStatus(status), color, icon, modifier)
}

@Composable
fun ActivityPill(activity: String, modifier: Modifier = Modifier) {
    StatusPill(Labels.activity(activity), activityColor(activity), modifier = modifier)
}

@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        action?.invoke()
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, body: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(48.dp), tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.size(12.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.size(4.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        action?.let { Spacer(Modifier.size(12.dp)); it() }
    }
}

/** Barra de progreso: real si existe, indeterminada si solo hay actividad. */
@Composable
fun TaskProgress(progress: Double?, running: Boolean, modifier: Modifier = Modifier) {
    when {
        progress != null -> LinearProgressIndicator(
            progress = { progress.toFloat().coerceIn(0f, 1f) },
            modifier = modifier.fillMaxWidth().clip(RoundedCornerShape(50)),
        )
        running -> LinearProgressIndicator(modifier.fillMaxWidth().clip(RoundedCornerShape(50)))
    }
}

/**
 * Aviso de conexión: sin conexión (con cuenta atrás y «Reintentar»), conectando o datos guardados.
 * Se anuncia a los lectores de pantalla cuando cambia.
 */
@Composable
fun ConnectionBanner(
    connection: Connection,
    syncedAt: Long?,
    fromCache: Boolean,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (connection == Connection.Online) return
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(connection) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val (title, detail) = when (connection) {
        is Connection.Offline -> {
            val seconds = connection.retryAt?.let { ((it - now) / 1000).coerceAtLeast(0) }
            "Sin conexión" to buildString {
                append(connection.reason)
                if (seconds != null) append(if (seconds > 0) " · Reintento en $seconds s" else " · Reintentando…")
            }
        }
        Connection.Connecting -> "Conectando…" to if (fromCache) "Mostrando los datos guardados ${Format.relative(syncedAt, now)}" else "Sincronizando con el ordenador"
        else -> "En pausa" to "Se reconecta al volver a la app"
    }
    val offline = connection is Connection.Offline
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {
                liveRegion = LiveRegionMode.Polite
                contentDescription = "$title. $detail"
            },
        color = if (offline) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceContainerHigh,
        contentColor = if (offline) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurface,
        shape = RoundedCornerShape(16.dp),
    ) {
        Row(Modifier.padding(start = 14.dp, end = 4.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (offline) {
                Icon(Icons.Outlined.CloudOff, contentDescription = null, modifier = Modifier.size(20.dp))
            } else {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.labelLarge)
                Text(detail, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (offline && syncedAt != null) {
                    Text("Datos de ${Format.relative(syncedAt, now)}", style = MaterialTheme.typography.bodySmall)
                }
            }
            if (offline) TextButton(onClick = onRetry) { Text("Reintentar") }
        }
    }
}

@Composable
fun SecureBadge(modifier: Modifier = Modifier) {
    StatusPill("Cifrado", LocalStatusColors.current.success, Icons.Outlined.Lock, modifier)
}
