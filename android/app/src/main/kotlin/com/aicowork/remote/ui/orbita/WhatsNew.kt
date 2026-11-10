package com.aicowork.remote.ui.orbita

import com.aicowork.remote.i18n.t
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.aicowork.remote.data.CoworkController
import com.aicowork.remote.data.model.WhatsNewInfo

private const val NEWS_PREFS = "orbita_novedades"
private const val NEWS_SEEN = "vista"

/**
 * «Novedades»: cuando el servidor se ha actualizado, una ventana con sus mejoras. Cada móvil apunta la versión que
 * vio (news.to) y la enseña una sola vez. Solo si el servidor lo admite ([available]).
 */
@Composable
fun WhatsNewPopup(controller: CoworkController, available: Boolean) {
    val context = LocalContext.current
    var news by remember { mutableStateOf<WhatsNewInfo?>(null) }
    LaunchedEffect(available) {
        if (!available) return@LaunchedEffect
        val seen = context.getSharedPreferences(NEWS_PREFS, Context.MODE_PRIVATE).getString(NEWS_SEEN, null)
        controller.serverNews().onSuccess { n ->
            if (n != null && !n.failed && n.items.isNotEmpty() && n.to != seen) news = n
        }
    }
    val n = news ?: return
    val close = {
        context.getSharedPreferences(NEWS_PREFS, Context.MODE_PRIVATE).edit().putString(NEWS_SEEN, n.to).apply()
        news = null
    }
    AlertDialog(
        onDismissRequest = close,
        containerColor = Color(0xF20E1730),
        title = {
            Column {
                Text(t("Novedades de kywai"), color = Orbita.Text)
                Text(
                    if (n.from.isNotEmpty()) t("Se actualizó a la versión {to} (tenías la {from}).", "to" to n.to, "from" to n.from)
                    else t("Se actualizó a la versión {to}. Estos son los últimos cambios:", "to" to n.to),
                    color = Orbita.TextSoft,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        },
        text = {
            Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                n.items.forEach { item ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Outlined.CheckCircle, contentDescription = null, tint = Orbita.Accent, modifier = Modifier.size(16.dp).padding(top = 2.dp))
                        Text(item, color = Orbita.Text, style = MaterialTheme.typography.bodyMedium)
                    }
                }
                if (n.more > 0) Text(t("y {n} cambios más", "n" to n.more), color = Orbita.TextFaint, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = { TextButton(onClick = close) { Text(t("Entendido"), color = Orbita.Accent) } },
        dismissButton = n.url?.let { url ->
            {
                TextButton(onClick = {
                    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                }) { Text(t("Ver en GitHub"), color = Orbita.TextSoft) }
            }
        },
    )
}
