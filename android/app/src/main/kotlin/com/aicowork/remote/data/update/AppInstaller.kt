package com.aicowork.remote.data.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.IntentCompat
import com.aicowork.remote.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.withContext
import java.io.File

/** Lo que necesita [AppUpdater] de Android: la versión instalada, el permiso y la instalación en sí. */
interface AppInstaller {
    val versionCode: Long
    val versionName: String
    /** La versión de desarrollo (otro paquete): se actualiza desde Android Studio, no desde el ordenador. */
    val isDevBuild: Boolean
    /** Dónde se guardan las APK descargadas. */
    val downloadDir: File
    /** Fallos que Android avisa después de entregarle la APK. */
    val failures: Flow<String>
    /** Android deja a Órbita instalar apps (Ajustes → «Instalar apps desconocidas»). */
    fun canInstall(): Boolean
    /** Abre ese ajuste para Órbita. */
    fun requestPermission()
    /** Entrega la APK a Android, que instala la versión nueva encima (y cierra Órbita). */
    suspend fun install(apk: File)
}

/** Avisos del instalador de Android (llegan a [InstallResultReceiver] aunque la pantalla haya cambiado). */
object InstallEvents {
    val failures = MutableSharedFlow<String>(extraBufferCapacity = 8)
}

/** Instala con PackageInstaller: al actualizarse a sí misma, Android puede hacerlo sin preguntar (Android 12+). */
class PackageInstallerAppInstaller(context: Context) : AppInstaller {
    private val context = context.applicationContext
    override val versionCode = BuildConfig.VERSION_CODE.toLong()
    override val versionName: String = BuildConfig.VERSION_NAME
    override val isDevBuild = BuildConfig.DEBUG
    override val downloadDir = File(this.context.cacheDir, "actualizacion")
    override val failures: Flow<String> = InstallEvents.failures

    override fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    override fun requestPermission() {
        context.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    override suspend fun install(apk: File) = withContext(Dispatchers.IO) {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setSize(apk.length())
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        try {
            installer.openSession(id).use { session ->
                apk.inputStream().use { input ->
                    session.openWrite("orbita.apk", 0, apk.length()).use { output ->
                        input.copyTo(output, 64 * 1024)
                        session.fsync(output)
                    }
                }
                // PackageInstaller rellena el resultado en el intent: tiene que poder modificarse.
                val mutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
                val result = PendingIntent.getBroadcast(context, id, Intent(context, InstallResultReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or mutable)
                session.commit(result.intentSender)
            }
        } catch (e: Exception) {
            runCatching { installer.abandonSession(id) }
            throw e
        }
    }
}

/** Resultado de la instalación: si Android pide confirmarla, abre su ventana; si falla, lo cuenta en Ajustes. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent::class.java) ?: return
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> Unit
            else -> InstallEvents.failures.tryEmit(installFailure(status, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)))
        }
    }
}

internal fun installFailure(status: Int, detail: String?): String = when (status) {
    PackageInstaller.STATUS_FAILURE_ABORTED -> "Instalación cancelada."
    PackageInstaller.STATUS_FAILURE_CONFLICT, PackageInstaller.STATUS_FAILURE_INCOMPATIBLE ->
        "Android no la instala encima: no está firmada con la misma clave que la que tienes. Instálala a mano una vez."
    PackageInstaller.STATUS_FAILURE_STORAGE -> "No hay espacio en el móvil para instalarla."
    PackageInstaller.STATUS_FAILURE_INVALID -> "La APK no es válida."
    PackageInstaller.STATUS_FAILURE_BLOCKED -> "Android bloqueó la instalación."
    else -> "Android no pudo instalarla" + (detail?.takeIf { it.isNotBlank() }?.let { ": $it" } ?: ".")
}
