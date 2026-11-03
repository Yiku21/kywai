package com.aicowork.remote

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import com.aicowork.remote.data.CoworkRepository
import com.aicowork.remote.data.model.InboxItem
import com.aicowork.remote.ui.orbita.InboxKinds
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Notificaciones del sistema de la bandeja «Te necesita»: una por cada aviso abierto nuevo (id que este móvil no
 * había visto), salvo si estás mirando la bandeja. Tocarla abre la app en la bandeja.
 *
 * Solo avisa mientras la app sigue conectada al ordenador (a la vista o poco después de pasar a segundo plano): no hay
 * servicio en primer plano ni push (FCM), porque AI Cowork no tiene servidor de push.
 *
 * Todo ocurre en el hilo principal.
 */
class InboxNotifier(
    private val context: Context,
    private val repository: CoworkRepository,
    scope: CoroutineScope,
) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val manager = NotificationManagerCompat.from(context)

    /** Avisos ya notificados o vistos en la bandeja (los últimos [MAX_SEEN], del más antiguo al más reciente). */
    private val seen = LinkedHashSet(prefs.getString(KEY_SEEN, null)?.split('\n')?.filter { it.isNotBlank() }.orEmpty())

    /** Avisos con notificación a la vista (para quitarla en cuanto se resuelven). */
    private val posted = mutableSetOf<String>()
    private var summaryPosted = false

    /** La bandeja está abierta en la app: lo que hay en ella ya se ha visto. */
    var sheetVisible: Boolean = false
        set(value) {
            field = value
            if (value) markAllSeen()
        }

    init {
        createChannel()
        scope.launch(Dispatchers.Main) {
            repository.state.map { it.inbox }.distinctUntilChanged().collect { onInbox(it) }
        }
    }

    private fun onInbox(items: List<InboxItem>) {
        val open = items.filter { it.isOpen }
        val openIds = open.map { it.id }.toSet()
        // Lo que ya no está abierto (resuelto aquí o en el ordenador) deja de avisar.
        posted.filterNot { it in openIds }.forEach { manager.cancel(it, NOTIFICATION_ID) }
        posted.retainAll(openIds)
        if (open.isEmpty() && summaryPosted) {
            manager.cancel(SUMMARY_TAG, NOTIFICATION_ID)
            summaryPosted = false
        }

        val fresh = open.filter { it.id !in seen }
        if (fresh.isEmpty()) return
        fresh.forEach { remember(it.id) }
        saveSeen()
        if (sheetVisible && inForeground()) return
        if (fresh.size > MAX_SINGLE) {
            notifySafely(SUMMARY_TAG, summary(fresh, open.size))
            summaryPosted = true
        } else {
            fresh.forEach { item -> if (notifySafely(item.id, single(item))) posted += item.id }
        }
    }

    private fun markAllSeen() {
        repository.state.value.inbox.forEach { remember(it.id) }
        saveSeen()
        posted.forEach { manager.cancel(it, NOTIFICATION_ID) }
        posted.clear()
        if (summaryPosted) {
            manager.cancel(SUMMARY_TAG, NOTIFICATION_ID)
            summaryPosted = false
        }
    }

    private fun remember(id: String) {
        seen.remove(id)
        seen.add(id)
        while (seen.size > MAX_SEEN) seen.remove(seen.first())
    }

    private fun saveSeen() {
        prefs.edit().putString(KEY_SEEN, seen.joinToString("\n")).apply()
    }

    private fun inForeground(): Boolean =
        ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

    private fun createChannel() {
        val channel = NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_HIGH)
            .setName("Te necesita")
            .setDescription("Avisos del equipo que esperan tu respuesta: planes, preguntas, permisos en el Mac, fallos…")
            .build()
        manager.createNotificationChannel(channel)
    }

    private fun single(item: InboxItem): Notification {
        val kind = InboxKinds.label(item.kind)
        val detail = item.detail?.takeIf { it.isNotBlank() }
        return builder()
            .setContentTitle(item.title.ifBlank { kind })
            .setContentText(detail ?: kind)
            .setSubText(kind)
            .setStyle(NotificationCompat.BigTextStyle().bigText(detail ?: kind))
            .setWhen(item.createdAt?.takeIf { it > 0 } ?: System.currentTimeMillis())
            .build()
    }

    private fun summary(fresh: List<InboxItem>, total: Int): Notification {
        val style = NotificationCompat.InboxStyle()
        fresh.take(5).forEach { style.addLine(it.title.ifBlank { InboxKinds.label(it.kind) }) }
        if (fresh.size > 5) style.setSummaryText("y ${fresh.size - 5} más")
        return builder()
            .setContentTitle(if (total == 1) "1 aviso te necesita" else "$total avisos te necesitan")
            .setContentText(fresh.first().title.ifBlank { InboxKinds.label(fresh.first().kind) })
            .setStyle(style)
            .setNumber(total)
            .build()
    }

    private fun builder(): NotificationCompat.Builder = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_inbox)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setAutoCancel(true)
        .setShowWhen(true)
        .setContentIntent(openInbox())

    /** Abre la app (la misma pantalla si ya estaba abierta) directamente en la bandeja. */
    private fun openInbox(): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = ACTION_OPEN_INBOX
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Sin permiso (Android 13+) o con las notificaciones apagadas no se muestra nada: la bandeja sigue en la app. */
    @SuppressLint("MissingPermission")
    private fun notifySafely(tag: String, notification: Notification): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        if (!manager.areNotificationsEnabled()) return false
        return try {
            manager.notify(tag, NOTIFICATION_ID, notification)
            true
        } catch (e: SecurityException) {
            false
        }
    }

    companion object {
        const val CHANNEL_ID = "te-necesita"
        /** Acción del Intent que abre la app en la bandeja. */
        const val ACTION_OPEN_INBOX = "com.aicowork.remote.action.OPEN_INBOX"
        private const val PREFS = "inbox_notifications"
        private const val KEY_SEEN = "seen"
        private const val NOTIFICATION_ID = 7_001
        private const val SUMMARY_TAG = "te-necesita-resumen"
        /** Más avisos nuevos a la vez que esto: una sola notificación que los resume. */
        private const val MAX_SINGLE = 3
        private const val MAX_SEEN = 300
    }
}
