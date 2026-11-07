package com.aicowork.remote

import com.aicowork.remote.i18n.t

import android.Manifest
import android.annotation.SuppressLint
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
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Envía en segundo plano la cola de mensajes escritos sin conexión: Android lo lanza cuando vuelve la red, aunque
 * Órbita esté cerrada (WorkManager). Si al terminar la app no está a la vista, avisa con una notificación de cuántos
 * salieron. Con la app abierta y conectada, la cola la vacía el tiempo real y este trabajo no hace nada.
 */
class OutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val app = applicationContext as? CoworkApplication ?: return Result.success()
        val repository = app.container.repository
        if (repository.state.value.session == null) return Result.success()
        val result = repository.drainOutbox()
        if (result.sent > 0 && !inForeground()) OutboxNotice.sent(applicationContext, result.sent)
        // Lo que sigue en la cola (la red volvió, pero el ordenador aún no responde) se reintenta más tarde.
        return if (result.waiting > 0) Result.retry() else Result.success()
    }

    private fun inForeground(): Boolean =
        ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)

    companion object {
        private const val WORK_NAME = "orbita-cola-sin-conexion"

        /** Programa el envío para cuando haya red (si ya estaba programado, se deja como está). */
        fun schedule(context: Context) {
            runCatching {
                val request = OneTimeWorkRequestBuilder<OutboxWorker>()
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()
                WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
            }
        }
    }
}

/** Notificación «Se enviaron tus mensajes»: tocarla abre la app. */
object OutboxNotice {
    private const val CHANNEL_ID = "cola-enviada"
    private const val NOTIFICATION_ID = 7_101

    @SuppressLint("MissingPermission")
    fun sent(context: Context, count: Int) {
        val manager = NotificationManagerCompat.from(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        if (!manager.areNotificationsEnabled()) return
        manager.createNotificationChannel(
            NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
                .setName(t("Mensajes enviados"))
                .setDescription(t("Aviso de que salieron los mensajes que escribiste sin conexión"))
                .build()
        )
        val open = PendingIntent.getActivity(
            context, 1,
            Intent(context, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val title = if (count == 1) t("Se envió tu mensaje") else t("Se enviaron tus {n} mensajes", "n" to count)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_inbox)
            .setContentTitle(title)
            .setContentText(t("Lo que escribiste sin conexión ya está en el ordenador"))
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        try {
            manager.notify(NOTIFICATION_ID, notification)
        } catch (_: SecurityException) {
        }
    }
}
