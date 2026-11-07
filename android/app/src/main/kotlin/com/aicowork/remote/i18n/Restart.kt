package com.aicowork.remote.i18n

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import kotlin.system.exitProcess

/**
 * Reinicia Órbita para aplicar otro idioma: hay textos que se preparan una sola vez al abrir la app, así que se abre
 * de nuevo desde cero (como el escritorio recarga la ventana). La sesión y la conversación se conservan.
 */
fun restartApp(context: Context) {
    val activity = context.findActivity() ?: return
    val launch = activity.packageManager.getLaunchIntentForPackage(activity.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
    activity.finishAffinity()
    activity.startActivity(launch)
    exitProcess(0)
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
