package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Chat
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.aicowork.remote.data.CoworkUiState
import com.aicowork.remote.data.model.InboxAction
import com.aicowork.remote.data.model.InboxItem
import com.aicowork.remote.ui.components.Format
import kotlinx.coroutines.delay

// ---------------------------------------------------------------------------------------------- Bandeja «Te necesita»

/** Lo que muestra cada tipo de aviso: su nombre y su icono. */
object InboxKinds {
    fun label(kind: String): String = when (kind) {
        "plan" -> t("Plan por aprobar")
        "stalled" -> t("Atascado")
        "mac-permission" -> t("Permiso en el Mac")
        "question" -> t("Pregunta")
        "verify-failed" -> t("Comprobación fallida")
        "conflict" -> t("Conflicto")
        "failed" -> t("Falló")
        "done" -> t("Terminado")
        else -> t("Aviso")
    }

    fun icon(kind: String): ImageVector = when (kind) {
        "plan" -> Icons.Outlined.Checklist
        "stalled" -> Icons.Outlined.HourglassEmpty
        "mac-permission" -> Icons.Outlined.Security
        "question" -> Icons.AutoMirrored.Outlined.Chat
        "verify-failed" -> Icons.Outlined.WarningAmber
        "conflict" -> Icons.Outlined.Sync
        "failed" -> Icons.Outlined.ErrorOutline
        "done" -> Icons.Outlined.CheckCircle
        else -> Icons.Outlined.Notifications
    }

    fun tint(kind: String): Color = when (kind) {
        "failed", "verify-failed", "conflict" -> Orbita.Danger
        "done" -> Orbita.Success
        "stalled", "mac-permission" -> Orbita.Warn
        else -> Orbita.Accent
    }
}

/** ¿El ordenador tiene bandeja? Un servidor anterior no la tiene y entonces no se muestra nada de ella. */
fun inboxSupported(state: CoworkUiState): Boolean = state.snapshot?.capabilities?.inbox == true

/** Acceso a la bandeja en la barra superior, con cuántos avisos esperan. */
@Composable
fun InboxButton(state: CoworkUiState, model: OrbitaModel, modifier: Modifier = Modifier) {
    if (!inboxSupported(state)) return
    val count = state.inbox.size
    // La insignia va fuera del cristal (que recorta en círculo) para que no se corte.
    Box(modifier.size(46.dp)) {
        Box(
            Modifier
                .fillMaxSize()
                .glass(radius = 23.dp)
                .tappable(haptic = Haptic.Tap) { model.openInbox() }
                .semantics {
                    contentDescription = if (count > 0) t("Te necesita: {count} avisos", "count" to count) else t("Te necesita: nada pendiente")
                    liveRegion = LiveRegionMode.Polite
                }
                .testTag("inbox-button"),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Outlined.Notifications, contentDescription = null, tint = if (count > 0) Orbita.Warn else Orbita.TextSoft, modifier = Modifier.size(22.dp))
        }
        if (count > 0) Box(Modifier.align(Alignment.TopEnd).offset(x = 6.dp, y = (-4).dp)) { CountBadge(count) }
    }
}

/** La bandeja: lo que el equipo necesita de ti, con sus botones. */
@Composable
fun InboxSheet(model: OrbitaModel, state: CoworkUiState) {
    val context = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(30_000)
        }
    }
    fun press(item: InboxItem, action: InboxAction) {
        val url = action.url
        if (url == null) {
            model.inboxAction(item, action)
            return
        }
        // Lo abre otra app del móvil (p. ej. vnc:// para Compartir pantalla): no se envía al ordenador.
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            model.feedback.confirm()
        } catch (e: ActivityNotFoundException) {
            model.feedback.reject()
            model.toast(t("Ninguna app del móvil sabe abrir «{v1}»: instala una para «{label}».", "v1" to (url.substringBefore(':')), "label" to action.label), Toast.Tone.Error)
        }
    }

    val pending = state.inbox
    Column(Modifier.fillMaxWidth().widthIn(max = 640.dp).glass(radius = 30.dp, tint = Orbita.GlassSolid).testTag("inbox")) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 8.dp, top = 12.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Notifications, null, tint = Orbita.Accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(t("Te necesita"), color = Orbita.Text, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (pending.isEmpty()) t("Nada pendiente") else if (pending.size == 1) t("1 aviso espera tu respuesta") else t("{size} avisos esperan tu respuesta", "size" to pending.size),
                    color = Orbita.TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            IconAction(Icons.Outlined.Close, t("Cerrar"), onClick = { model.closeInbox() })
        }
        if (pending.isEmpty()) {
            Note(
                Icons.Outlined.CheckCircle,
                t("Todo en orden"),
                t("Cuando un agente necesite tu visto bueno, una respuesta o un permiso en el Mac, aparecerá aquí."),
                Modifier.padding(14.dp),
                tint = Orbita.Success,
            )
        } else {
            LazyColumn(
                Modifier.weight(1f, fill = false).fillMaxWidth().testTag("inbox-list"),
                contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 4.dp, bottom = 14.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(pending, key = { it.id }) { item -> InboxCard(item, model, now, onPress = { action -> press(item, action) }) }
            }
        }
    }
}

@Composable
private fun InboxCard(item: InboxItem, model: OrbitaModel, now: Long, onPress: (InboxAction) -> Unit) {
    val canOpen = model.inboxTargetExists(item)
    Column(Modifier.fillMaxWidth().card().padding(14.dp).testTag("inbox-item-${item.id}")) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(InboxKinds.icon(item.kind), contentDescription = null, tint = InboxKinds.tint(item.kind), modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(InboxKinds.label(item.kind), color = InboxKinds.tint(item.kind), style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f), maxLines = 1)
            Text(Format.relative(item.createdAt, now), color = Orbita.TextFaint, style = MaterialTheme.typography.labelSmall, maxLines = 1)
        }
        Spacer(Modifier.height(6.dp))
        Row(
            Modifier
                .fillMaxWidth()
                .clip(Orbita.CardShape)
                .tappable(enabled = canOpen, haptic = Haptic.Select) { model.openInboxItem(item) }
                .padding(vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                item.title.ifBlank { InboxKinds.label(item.kind) },
                color = Orbita.Text,
                style = MaterialTheme.typography.titleSmall,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            if (canOpen) Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = t("Abrir la conversación"), tint = Orbita.TextSoft, modifier = Modifier.size(18.dp))
        }
        item.detail?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(4.dp))
            Text(it, color = Orbita.TextSoft, style = MaterialTheme.typography.bodyMedium, maxLines = 6, overflow = TextOverflow.Ellipsis)
        }
        if (item.actions.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item.actions.forEachIndexed { index, action ->
                    val busy = model.inboxBusy == "${item.id}|${action.id}"
                    OrbitaButton(
                        action.label,
                        onClick = { onPress(action) },
                        icon = if (action.url != null) Icons.AutoMirrored.Outlined.OpenInNew else null,
                        style = if (index == 0) ButtonStyle.Primary else ButtonStyle.Secondary,
                        enabled = model.inboxBusy == null || busy,
                        busy = busy,
                        haptic = Haptic.Tap,
                        height = 42.dp,
                        modifier = Modifier.heightIn(min = 42.dp).testTag("inbox-action-${item.id}-${action.id}"),
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------- Permiso de notificaciones

/** Dónde se recuerda que ya se pidió el permiso de notificaciones (se pide una sola vez). */
private const val NOTIFICATION_PREFS = "inbox_notifications"
private const val PERMISSION_ASKED = "permissionAsked"

/**
 * Android 13+: pide una vez el permiso de notificaciones, cuando ya hay bandeja y algo en ella (o la abres): así se
 * entiende para qué es. Si se niega, la bandeja sigue funcionando dentro de la app.
 */
@Composable
fun AskNotificationsOnce(model: OrbitaModel, state: CoworkUiState) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val context = LocalContext.current
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) model.toast(t("Sin notificaciones: verás los avisos de «Te necesita» al abrir la app. Puedes activarlas en Ajustes › Aplicaciones › kywai."), Toast.Tone.Info)
    }
    val wanted = inboxSupported(state) && (state.inbox.isNotEmpty() || model.inboxOpen)
    LaunchedEffect(wanted) {
        if (!wanted) return@LaunchedEffect
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return@LaunchedEffect
        val prefs = context.getSharedPreferences(NOTIFICATION_PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(PERMISSION_ASKED, false)) return@LaunchedEffect
        // Un instante después, para no tapar el primer vistazo a la app.
        delay(1_200)
        prefs.edit().putBoolean(PERMISSION_ASKED, true).apply()
        ask.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
